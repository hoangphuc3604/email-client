from pymongo.database import Database
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.utils.security import decrypt_token
from app.config import settings
from bson import ObjectId
import email.utils
from datetime import datetime
import base64
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import mimetypes

logger = logging.getLogger(__name__)
from app.api.mail.models import (
    Mailbox,
    ThreadListResponse,
    ThreadDetailResponse,
    EmailUpdateRequest,
    EmailSearchRequest,
    ThreadPreview,
    ParsedMessage,
    Sender,
    Label,
    Attachment
)

class MailService:
  def __init__(self, db: Database):
    self.db = db
    self.users_collection = self.db["users"]

  async def get_gmail_service(self, user_id: str):
    user = await self.users_collection.find_one({"_id": ObjectId(user_id)})
    if not user or "google_refresh_token" not in user:
      raise ValueError("User not found or missing Google refresh token.")

    refresh_token = decrypt_token(user["google_refresh_token"])

    creds = Credentials(
      None,
      refresh_token=refresh_token,
      token_uri="https://oauth2.googleapis.com/token",
      client_id=settings.GOOGLE_CLIENT_ID,
      client_secret=settings.GOOGLE_CLIENT_SECRET
    )

    # Disable cache to avoid oauth2client<4.0.0 warning and crashes
    return build("gmail", "v1", credentials=creds, cache_discovery=False)

  async def get_mailboxes(self, user_id: str):
    service = await self.get_gmail_service(user_id)
    results = service.users().labels().list(userId='me').execute()
    labels = results.get('labels', [])

    return [
      {
        "id": label['id'],
        "name": label['name'],
        "type": label["type"],
        "unread_count": label.get("messagesUnread", 0),
        "total_count": label.get("messagesTotal", 0)
      }
      for label in labels
    ]

  async def get_emails(self, user_id: str, mailbox_id: str, page_token: str = None, limit: int = 50):
    service = await self.get_gmail_service(user_id)
    
    # Gmail API requires uppercase label IDs
    gmail_label = mailbox_id.upper()

    results = service.users().messages().list(
      userId='me',
      labelIds=[gmail_label],
      maxResults=limit,
      pageToken=page_token
    ).execute()

    messages = results.get('messages', [])
    next_page_token = results.get('nextPageToken', None)
    result_size_estimate = results.get('resultSizeEstimate', 0)

    thread_list = []

    for msg in messages:
      msg_data = service.users().messages().get(
        userId='me',
        id=msg['id'],
        format='metadata'
      ).execute()

      payload = msg_data.get('payload', {})
      headers = payload.get('headers', [])

      def get_header(name):
        return next((h['value'] for h in headers if h['name'].lower() == name.lower()), '')

      subject = get_header('Subject') or '(No Subject)'
      from_header = get_header('From')

      name, email_addr = email.utils.parseaddr(from_header)
      sender_obj = {"name": name, "email": email_addr}

      internal_date = msg_data.get('internalDate')
      received_on = datetime.fromtimestamp(int(internal_date)/1000).isoformat() if internal_date else ""

      # Use threadId if available, otherwise message id
      thread_id = msg_data.get('threadId', msg['id'])

      thread_list.append({
        "id": msg['id'], # Keep message ID for now as per existing logic, or switch to thread_id? 
                         # The prompt implies we need to support /emails/:id. 
                         # If we return msg['id'], :id will be message id.
        "history_id": msg_data.get('historyId'),
        "subject": subject,
        "sender": sender_obj,
        "received_on": received_on,
        "unread": "UNREAD" in msg_data.get('labelIds', []),
        "tags": [{"id": l, "name": l} for l in msg_data.get('labelIds', [])],
        "body": msg_data.get('snippet', '')
      })

    return {
      "threads": thread_list,
      "next_page_token": next_page_token,
      "result_size_estimate": result_size_estimate
    }

  async def get_email_detail(self, user_id: str, email_id: str) -> ThreadDetailResponse:
    service = await self.get_gmail_service(user_id)
    
    # First try to get the message to find the threadId
    try:
        msg_metadata = service.users().messages().get(userId='me', id=email_id, format='minimal').execute()
        thread_id = msg_metadata.get('threadId')
    except Exception:
        # If it fails, maybe email_id is already a thread_id? 
        # But standard flow is list -> click -> detail. list returns msg ids.
        # Let's assume it's a message ID. If not found, raise.
        raise ValueError("Message not found")

    # Fetch full thread with full message format to get attachment IDs
    thread_data = service.users().threads().get(userId='me', id=thread_id, format='full').execute()
    messages = thread_data.get('messages', [])
    
    parsed_messages = []
    for msg in messages:
        parsed = self._parse_gmail_message(msg)
        parsed_messages.append(parsed)
    
    # Sort by date
    parsed_messages.sort(key=lambda x: x['received_on'])
    
    latest = parsed_messages[-1] if parsed_messages else None
    
    return {
        "messages": parsed_messages,
        "latest": latest,
        "has_unread": any(m['unread'] for m in parsed_messages),
        "total_replies": len(parsed_messages) - 1 if parsed_messages else 0,
        "labels": latest['tags'] if latest else [],
        "is_latest_draft": False # TODO: check if latest is draft
    }

  def _parse_gmail_message(self, msg_data: dict) -> ParsedMessage:
      payload = msg_data.get('payload', {})
      headers = payload.get('headers', [])
      
      def get_header(name):
          return next((h['value'] for h in headers if h['name'].lower() == name.lower()), '')
      
      def get_header_list(name):
          val = get_header(name)
          if not val: return []
          # Simple split, ideally use email.utils.getaddresses
          return [{"name": n, "email": e} for n, e in email.utils.getaddresses([val])]

      subject = get_header('Subject') or '(No Subject)'
      from_header = get_header('From')
      name, email_addr = email.utils.parseaddr(from_header)
      sender = {"name": name, "email": email_addr}
      
      to_list = get_header_list('To')
      cc_list = get_header_list('Cc')
      bcc_list = get_header_list('Bcc')
      
      internal_date = msg_data.get('internalDate')
      received_on = datetime.fromtimestamp(int(internal_date)/1000).isoformat() if internal_date else ""
      
      label_ids = msg_data.get('labelIds', [])
      tags = [{"id": l, "name": l} for l in label_ids]
      
      body_text = ""
      body_html = ""
      attachments = []
      
      def parse_parts(parts):
          nonlocal body_text, body_html
          for part in parts:
              mime_type = part.get('mimeType')
              body = part.get('body', {})
              data = body.get('data')
              
              if part.get('filename'):
                  attachments.append({
                      "attachment_id": body.get('attachmentId'),
                      "message_id": msg_data['id'],
                      "filename": part.get('filename'),
                      "mime_type": mime_type,
                      "size": body.get('size', 0),
                      "body": "",
                      "headers": []
                  })
              
              if mime_type == 'text/plain' and data:
                  body_text += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
              elif mime_type == 'text/html' and data:
                  body_html += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
              elif part.get('parts'):
                  parse_parts(part.get('parts'))
      
      if 'parts' in payload:
          parse_parts(payload['parts'])
      else:
          # Single part message
          data = payload.get('body', {}).get('data')
          mime_type = payload.get('mimeType')
          if data:
              decoded = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
              if mime_type == 'text/html':
                  body_html = decoded
              else:
                  body_text = decoded

      return {
          "id": msg_data['id'],
          "thread_id": msg_data['threadId'],
          "title": subject,
          "subject": subject,
          "sender": sender,
          "to": to_list,
          "cc": cc_list,
          "bcc": bcc_list,
          "received_on": received_on,
          "unread": "UNREAD" in label_ids,
          "body": body_text or body_html, # Fallback
          "processed_html": body_html or f"<pre>{body_text}</pre>",
          "decoded_body": body_text,
          "tags": tags,
          "attachments": attachments,
          "message_id": get_header('Message-ID'),
          "in_reply_to": get_header('In-Reply-To'),
          "references": get_header('References')
      }

  async def send_email(self, user_id: str, email_data: dict, attachments: list = None):
      from googleapiclient.errors import HttpError
      
      if not email_data.get('to'):
          raise ValueError("Recipient email address is required")
      if not email_data.get('subject'):
          raise ValueError("Email subject is required")
      
      service = await self.get_gmail_service(user_id)
      
      try:
          message = MIMEMultipart()
          message['to'] = email_data.get('to')
          message['subject'] = email_data.get('subject')
          if email_data.get('cc'):
              message['cc'] = email_data.get('cc')
          if email_data.get('bcc'):
              message['bcc'] = email_data.get('bcc')
              
          body = email_data.get('body', '')
          # Simple detection, assume HTML if it looks like it, or just send as HTML
          msg = MIMEText(body, 'html')
          message.attach(msg)
          
          # Handle attachments
          if attachments:
              for attachment in attachments:
                  try:
                      mime_type_parts = attachment['mime_type'].split('/', 1)
                      if len(mime_type_parts) == 2:
                          part = MIMEBase(mime_type_parts[0], mime_type_parts[1])
                      else:
                          part = MIMEBase('application', 'octet-stream')
                      
                      part.set_payload(attachment['content'])
                      encoders.encode_base64(part)
                      part.add_header(
                          'Content-Disposition',
                          f'attachment; filename="{attachment["filename"]}"'
                      )
                      message.attach(part)
                  except Exception as e:
                      raise ValueError(f"Failed to attach file '{attachment.get('filename', 'unknown')}': {str(e)}")
          
          raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
          body = {'raw': raw}
          
          sent_message = service.users().messages().send(userId='me', body=body).execute()
          return sent_message
      except HttpError as e:
          if e.resp.status == 401:
              raise ValueError("Authentication failed. Please refresh your Google credentials.")
          elif e.resp.status == 403:
              raise ValueError("Access denied. Insufficient permissions to send email.")
          elif e.resp.status == 400:
              raise ValueError(f"Invalid email format: {str(e)}")
          else:
              raise ValueError(f"Gmail API error: {str(e)}")
      except ValueError:
          raise
      except Exception as e:
          raise ValueError(f"Failed to send email: {str(e)}")

  async def reply_email(self, user_id: str, email_id: str, reply_data: dict, attachments: list = None):
      from googleapiclient.errors import HttpError
      
      if not email_id:
          raise ValueError("Email ID is required")
      if not reply_data.get('to'):
          raise ValueError("Recipient email address is required")
      if not reply_data.get('subject'):
          raise ValueError("Email subject is required")
      
      service = await self.get_gmail_service(user_id)
      
      try:
          # Get original message to find threadId and headers
          original_msg = service.users().messages().get(userId='me', id=email_id, format='metadata').execute()
          thread_id = original_msg.get('threadId')
          
          if not thread_id:
              raise ValueError(f"Could not find thread ID for message {email_id}")
          
          payload = original_msg.get('payload', {})
          headers = payload.get('headers', [])
          
          def get_header(name):
              return next((h['value'] for h in headers if h['name'].lower() == name.lower()), '')
              
          message_id = get_header('Message-ID')
          references = get_header('References')
          if references:
              references = references + " " + message_id
          else:
              references = message_id
              
          message = MIMEMultipart()
          message['to'] = reply_data.get('to')
          message['subject'] = reply_data.get('subject') # Should probably prepend Re: if not present
          message['In-Reply-To'] = message_id
          message['References'] = references
          
          body = reply_data.get('body', '')
          msg = MIMEText(body, 'html')
          message.attach(msg)
          
          # Handle attachments
          if attachments:
              for attachment in attachments:
                  try:
                      mime_type_parts = attachment['mime_type'].split('/', 1)
                      if len(mime_type_parts) == 2:
                          part = MIMEBase(mime_type_parts[0], mime_type_parts[1])
                      else:
                          part = MIMEBase('application', 'octet-stream')
                      
                      part.set_payload(attachment['content'])
                      encoders.encode_base64(part)
                      part.add_header(
                          'Content-Disposition',
                          f'attachment; filename="{attachment["filename"]}"'
                      )
                      message.attach(part)
                  except Exception as e:
                      raise ValueError(f"Failed to attach file '{attachment.get('filename', 'unknown')}': {str(e)}")
          
          raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
          body = {
              'raw': raw,
              'threadId': thread_id
          }
          
          sent_message = service.users().messages().send(userId='me', body=body).execute()
          return sent_message
      except HttpError as e:
          if e.resp.status == 404:
              raise ValueError(f"Original message {email_id} not found")
          elif e.resp.status == 401:
              raise ValueError("Authentication failed. Please refresh your Google credentials.")
          elif e.resp.status == 403:
              raise ValueError("Access denied. Insufficient permissions to send email.")
          elif e.resp.status == 400:
              raise ValueError(f"Invalid email format: {str(e)}")
          else:
              raise ValueError(f"Gmail API error: {str(e)}")
      except ValueError:
          raise
      except Exception as e:
          raise ValueError(f"Failed to reply to email: {str(e)}")

  async def create_draft(self, user_id: str, draft_data: dict, attachments: list = None):
      """Create a draft email in Gmail."""
      from googleapiclient.errors import HttpError
      
      if not draft_data.get('to'):
          raise ValueError("Recipient email address is required")
      
      service = await self.get_gmail_service(user_id)
      
      try:
          message = MIMEMultipart()
          message['to'] = draft_data.get('to')
          message['subject'] = draft_data.get('subject', '(no subject)')
          if draft_data.get('cc'):
              message['cc'] = draft_data.get('cc')
          if draft_data.get('bcc'):
              message['bcc'] = draft_data.get('bcc')
              
          body = draft_data.get('body', '')
          msg = MIMEText(body, 'html')
          message.attach(msg)
          
          # Handle attachments
          if attachments:
              for attachment in attachments:
                  try:
                      mime_type_parts = attachment['mime_type'].split('/', 1)
                      if len(mime_type_parts) == 2:
                          part = MIMEBase(mime_type_parts[0], mime_type_parts[1])
                      else:
                          part = MIMEBase('application', 'octet-stream')
                      
                      part.set_payload(attachment['content'])
                      encoders.encode_base64(part)
                      part.add_header(
                          'Content-Disposition',
                          f'attachment; filename="{attachment["filename"]}"'
                      )
                      message.attach(part)
                  except Exception as e:
                      raise ValueError(f"Failed to attach file '{attachment.get('filename', 'unknown')}': {str(e)}")
          
          raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
          draft_body = {
              'message': {
                  'raw': raw
              }
          }
          
          draft = service.users().drafts().create(userId='me', body=draft_body).execute()
          return draft
      except HttpError as e:
          if e.resp.status == 401:
              raise ValueError("Authentication failed. Please refresh your Google credentials.")
          elif e.resp.status == 403:
              raise ValueError("Access denied. Insufficient permissions to create draft.")
          elif e.resp.status == 400:
              raise ValueError(f"Invalid draft format: {str(e)}")
          else:
              raise ValueError(f"Gmail API error: {str(e)}")
      except ValueError:
          raise
      except Exception as e:
          raise ValueError(f"Failed to create draft: {str(e)}")

  async def modify_email(self, user_id: str, email_id: str, updates: dict):
      service = await self.get_gmail_service(user_id)
      
      print(f"[MODIFY EMAIL] user_id={user_id}, email_id={email_id}, updates={updates}")

      add_labels = []
      remove_labels = []

      # Handle unread/read status
      if 'unread' in updates:
          if updates['unread']:
              add_labels.append('UNREAD')
              if 'UNREAD' in remove_labels:
                  remove_labels.remove('UNREAD')
          else:
              remove_labels.append('UNREAD')
              if 'UNREAD' in add_labels:
                  add_labels.remove('UNREAD')

      # Handle starred status
      if 'starred' in updates:
          if updates['starred']:
              add_labels.append('STARRED')
              if 'STARRED' in remove_labels:
                  remove_labels.remove('STARRED')
          else:
              remove_labels.append('STARRED')
              if 'STARRED' in add_labels:
                  add_labels.remove('STARRED')

      # Handle custom labels array (e.g., labels: ['trash'] to move to trash)
      if 'labels' in updates:
          labels_to_add = updates.get('labels', [])
          for label in labels_to_add:
              label_upper = label.upper()
              if label_upper not in add_labels:
                  add_labels.append(label_upper)
              # Remove from remove list if it was there
              if label_upper in remove_labels:
                  remove_labels.remove(label_upper)

      # Handle trash flag
      if updates.get('trash'):
           if 'TRASH' not in add_labels:
               add_labels.append('TRASH')
           if 'TRASH' in remove_labels:
               remove_labels.remove('TRASH')

      body = {
          'addLabelIds': add_labels,
          'removeLabelIds': remove_labels
      }
      
      print(f"[MODIFY EMAIL] Sending to Gmail API - add: {add_labels}, remove: {remove_labels}")

      updated_message = service.users().messages().modify(userId='me', id=email_id, body=body).execute()
      
      print(f"[MODIFY EMAIL] Gmail API response: {updated_message}")

      # We need to return the updated email detail
      return await self.get_email_detail(user_id, email_id)

  def _ensure_filename_extension(self, filename: str, mime_type: str) -> str:
      """Ensure filename has proper extension based on mime type."""
      if not filename or filename == 'attachment':
          extension = mimetypes.guess_extension(mime_type)
          if extension:
              return f"attachment{extension}"
          return filename
      
      if '.' in filename:
          return filename
      
      extension = mimetypes.guess_extension(mime_type)
      if extension:
          return f"{filename}{extension}"
      
      return filename

  async def get_attachment(self, user_id: str, message_id: str, attachment_id: str):
      """Get attachment data and metadata (filename, mime_type) from Gmail API."""
      from googleapiclient.errors import HttpError
      
      if not message_id or not attachment_id:
          raise ValueError("message_id and attachment_id are required")
      
      logger.info(f"[Attachment] Starting - message_id: {message_id}, attachment_id: {attachment_id[:50]}...")
      
      service = await self.get_gmail_service(user_id)
      
      filename = 'attachment'
      mime_type = 'application/octet-stream'
      found = False
      
      try:
          message = service.users().messages().get(userId='me', id=message_id, format='full').execute()
          payload = message.get('payload', {})
          
          logger.info(f"[Attachment] Message payload structure - has_parts: {'parts' in payload}, has_body: {'body' in payload}")
          
          fallback_attachment = None
          
          def find_attachment_in_parts(parts, depth=0):
              nonlocal filename, mime_type, found, fallback_attachment
              if not parts:
                  return False
              
              logger.info(f"[Attachment] Searching in {len(parts)} parts at depth {depth}")
              
              for idx, part in enumerate(parts):
                  part_attachment_id = part.get('body', {}).get('attachmentId')
                  part_filename = part.get('filename', '')
                  part_mime = part.get('mimeType', '')
                  
                  logger.info(f"[Attachment] Part {idx} - attachmentId: {part_attachment_id[:50] if part_attachment_id else 'None'}..., filename: {part_filename}, mimeType: {part_mime}")
                  
                  if part_attachment_id:
                      logger.info(f"[Attachment] Comparing - looking for: {attachment_id[:100]}..., found: {part_attachment_id[:100]}..., match: {part_attachment_id == attachment_id}")
                      
                      if part_attachment_id == attachment_id:
                          filename = part.get('filename', 'attachment') or 'attachment'
                          mime_type = part.get('mimeType', 'application/octet-stream')
                          found = True
                          logger.info(f"[Attachment] MATCH FOUND in parts - filename: {filename}, mime_type: {mime_type}")
                          return True
                      
                      if not fallback_attachment and part_filename:
                          fallback_attachment = {
                              'attachmentId': part_attachment_id,
                              'filename': part_filename,
                              'mimeType': part_mime
                          }
                          logger.info(f"[Attachment] Storing fallback attachment - filename: {part_filename}, mimeType: {part_mime}")
                  
                  if part.get('parts'):
                      if find_attachment_in_parts(part.get('parts'), depth + 1):
                          return True
              return False
          
          if 'parts' in payload:
              found = find_attachment_in_parts(payload['parts'])
              if not found:
                  logger.warning(f"[Attachment] Attachment not found in parts, checking payload body")
                  if payload.get('body', {}).get('attachmentId') == attachment_id:
                      filename = payload.get('filename', 'attachment') or 'attachment'
                      mime_type = payload.get('mimeType', 'application/octet-stream')
                      found = True
                      logger.info(f"[Attachment] Found attachment in payload body - filename: {filename}, mime_type: {mime_type}")
          elif payload.get('body', {}).get('attachmentId') == attachment_id:
              filename = payload.get('filename', 'attachment') or 'attachment'
              mime_type = payload.get('mimeType', 'application/octet-stream')
              found = True
              logger.info(f"[Attachment] Found attachment in payload body - filename: {filename}, mime_type: {mime_type}")
          
          if not found:
              logger.warning(f"[Attachment] Attachment ID not found in message structure")
              logger.warning(f"[Attachment] Looking for: {attachment_id[:100]}...")
              
              if fallback_attachment:
                  logger.info(f"[Attachment] Using fallback attachment - filename: {fallback_attachment['filename']}, mimeType: {fallback_attachment['mimeType']}")
                  filename = fallback_attachment['filename']
                  mime_type = fallback_attachment['mimeType']
                  found = True
              else:
                  logger.warning(f"[Attachment] No fallback attachment found, using defaults")
          
      except HttpError as e:
          if e.resp.status == 404:
              raise ValueError(f"Message {message_id} not found")
          elif e.resp.status == 401:
              raise ValueError("Authentication failed. Please refresh your Google credentials.")
          elif e.resp.status == 403:
              raise ValueError("Access denied. Insufficient permissions.")
          else:
              pass
      except Exception as e:
          pass
      
      logger.info(f"[Attachment] Before ensure_extension - filename: {filename}, mime_type: {mime_type}")
      filename = self._ensure_filename_extension(filename, mime_type)
      logger.info(f"[Attachment] After ensure_extension - filename: {filename}, mime_type: {mime_type}")
      
      try:
          attachment_id_to_fetch = attachment_id
          if not found and fallback_attachment:
              attachment_id_to_fetch = fallback_attachment['attachmentId']
              logger.info(f"[Attachment] Using fallback attachment ID to fetch data: {attachment_id_to_fetch[:50]}...")
          
          attachment = service.users().messages().attachments().get(
              userId='me', 
              messageId=message_id, 
              id=attachment_id_to_fetch
          ).execute()
          
          if 'data' not in attachment:
              raise ValueError("Attachment data not found in response")
              
          data = base64.urlsafe_b64decode(attachment['data'])
          logger.info(f"[Attachment] Fetched attachment data - size: {len(data)} bytes")
      except HttpError as e:
          if e.resp.status == 404:
              raise ValueError(f"Attachment {attachment_id} not found in message {message_id}")
          elif e.resp.status == 401:
              raise ValueError("Authentication failed. Please refresh your Google credentials.")
          elif e.resp.status == 403:
              raise ValueError("Access denied. Insufficient permissions.")
          else:
              raise ValueError(f"Gmail API error: {str(e)}")
      except Exception as e:
          raise ValueError(f"Failed to fetch attachment: {str(e)}")
      
      result = {
          "data": data,
          "filename": filename,
          "mime_type": mime_type
      }
      logger.info(f"[Attachment] Returning result - filename: {result['filename']}, mime_type: {result['mime_type']}, data_size: {len(result['data'])}")
      return result
