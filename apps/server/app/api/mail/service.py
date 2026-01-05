from pymongo.asynchronous.database import AsyncDatabase
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.utils.security import decrypt_token
from app.config import settings
from bson import ObjectId
import email.utils
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Set, Dict, Any, Iterable
import base64
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import mimetypes
import os
from datetime import datetime

from app.api.mail.semantic_embedding import encode_texts, MODEL_NAME
from app.api.mail.vector_store import get_vector_store


logger = logging.getLogger(__name__)

_email_html_logger = logging.getLogger('email_html')
_email_html_logger.setLevel(logging.INFO)
_email_html_logger.propagate = False

os.makedirs("logs", exist_ok=True)

date_str = datetime.now().strftime("%Y-%m-%d")
_email_html_file_handler = logging.FileHandler(f"logs/email-html-{date_str}.log", encoding='utf-8')
_email_html_file_handler.setLevel(logging.INFO)
_email_html_formatter = logging.Formatter('%(asctime)s [EMAIL_HTML] %(message)s')
_email_html_file_handler.setFormatter(_email_html_formatter)
_email_html_logger.addHandler(_email_html_file_handler)
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
    Attachment,
    EmailDocument,
    MailSyncState,
    UserLabel,
    KanbanColumn,
    SnoozeSchedule
)
from app.api.agents.summarizer import Summarizer

class MailService:
  def __init__(self, db: AsyncDatabase):
    self.db = db
    self.users_collection = self.db["users"]
    self.snoozed_collection = self.db["snoozed_emails"]
    self.email_index_collection = self.db["email_index"]
    self.sync_state_collection = self.db["mail_sync_state"]
    self.email_embeddings_collection = self.db["email_embeddings"]
    # New collections for DB-first architecture
    self.emails_collection = self.db["emails"]  # Full email documents
    self.labels_collection = self.db["labels"]
    self.kanban_columns_collection = self.db["kanban_columns"]
    self.snooze_schedules_collection = self.db["snooze_schedules"]
    self._summarizer: Optional[Summarizer] = None

    # Import and initialize sync service
    from app.api.mail.sync_service import EmailSyncService
    self.sync_service = EmailSyncService(db)

  def _get_summarizer(self) -> Summarizer:
    if self._summarizer is None:
      self._summarizer = Summarizer()
    return self._summarizer

  async def _resolve_label_id(self, service, user_id: str, mailbox_id: Optional[str]) -> Optional[str]:
    if not mailbox_id:
      return None
    
    system_labels_map = {
        'inbox': 'INBOX',
        'sent': 'SENT',
        'trash': 'TRASH',
        'drafts': 'DRAFT',
        'spam': 'SPAM',
        'starred': 'STARRED',
        'important': 'IMPORTANT',
        'snoozed': 'SNOOZED',
        'unread': 'UNREAD'
    }
    
    gmail_label_id = system_labels_map.get(mailbox_id.lower())
    if gmail_label_id:
      return gmail_label_id
    
    try:
      results = service.users().labels().list(userId='me').execute()
      labels = results.get('labels', [])
      
      search_name = mailbox_id
      if mailbox_id.lower() == 'todo':
        search_name = 'To Do'
      elif mailbox_id.lower() == 'done':
        search_name = 'Done'
      
      for label in labels:
        if label['name'].lower() == search_name.lower():
          gmail_label_id = label['id']
          break
    except Exception as e:
      print(f"Error resolving label {mailbox_id}: {e}")
      gmail_label_id = None
    
    return gmail_label_id


  def _build_embedding_text(self, doc: Dict[str, Any]) -> str:
    subject = doc.get("subject") or ""
    from_name = doc.get("from_name") or ""
    from_email = doc.get("from_email") or ""
    snippet = doc.get("snippet") or ""
    return f"Subject: {subject}\nFrom: {from_name} <{from_email}>\nSnippet: {snippet}"





  async def sync_email_index(self, user_id: str, mailbox_id: Optional[str] = None, max_emails: Optional[int] = None):
    """Smart sync that prioritizes recent emails and supports incremental updates."""
    return await self.sync_service.sync_email_index(user_id, mailbox_id, max_emails)

  async def _upsert_embeddings_batch(self, user_id: str, docs: Iterable[Dict[str, Any]], vector_store) -> None:
    docs_list = [d for d in docs if d.get("message_id")]
    if not docs_list:
      return
    texts = [self._build_embedding_text(d) for d in docs_list]
    embeddings = encode_texts(texts)
    now = datetime.utcnow().isoformat()
    items: List[Dict[str, Any]] = []
    
    for doc, emb in zip(docs_list, embeddings):
      message_id = doc["message_id"]
      labels = doc.get("labels") or []
      items.append(
        {
          "message_id": message_id,
          "embedding": emb,
          "metadata": {
            "labels": labels if isinstance(labels, list) else [labels],
            "model": MODEL_NAME,
            "updated_at": now,
          },
        }
      )
    
    if items:
      vector_store.upsert(user_id, items)

  def _build_search_pipeline(self, query: str, user_id: str, mailbox_label_id: Optional[str], limit: int, page: int) -> List[dict]:
    skip = (page - 1) * limit
    should_clauses = [
      {
        "autocomplete": {
          "path": "subject",
          "query": query,
          "fuzzy": {"maxEdits": 2, "prefixLength": 1},
          "score": {"boost": {"value": 5}}
        }
      },
      {
        "autocomplete": {
          "path": "from_name",
          "query": query,
          "fuzzy": {"maxEdits": 2, "prefixLength": 1},
          "score": {"boost": {"value": 3}}
        }
      },
      {
        "autocomplete": {
          "path": "from_email",
          "query": query,
          "fuzzy": {"maxEdits": 2, "prefixLength": 1},
          "score": {"boost": {"value": 3}}
        }
      },
      {
        "autocomplete": {
          "path": "snippet",
          "query": query,
          "fuzzy": {"maxEdits": 1, "prefixLength": 1},
          "score": {"boost": {"value": 1}}
        }
      }
    ]
    search_stage = {
      "$search": {
        "index": "emails_fuzzy",
        "compound": {
          "should": should_clauses
        }
      }
    }
    match: Dict[str, Any] = {"user_id": user_id}
    if mailbox_label_id:
      match["labels"] = mailbox_label_id
    match_stage = {
      "$match": match
    }
    project_stage = {
      "$project": {
        "message_id": 1,
        "thread_id": 1,
        "history_id": 1,
        "subject": 1,
        "from_name": 1,
        "from_email": 1,
        "to": 1,
        "received_on": 1,
        "labels": 1,
        "snippet": 1,
        "unread": 1,
        "score": {"$meta": "searchScore"}
      }
    }
    pipeline = [
      search_stage,
      match_stage,
      project_stage,
      {"$sort": {"score": -1, "received_on": -1}},
      {"$skip": skip},
      {"$limit": limit}
    ]
    return pipeline

  async def search_emails(self, user_id: str, query: str, mailbox_id: Optional[str], page: int, limit: int):
    logger.info(f"[SEARCH] user_id={user_id}, query='{query}', mailbox_id={mailbox_id}, page={page}, limit={limit}")
    service = await self.get_gmail_service(user_id)
    mailbox_label_id = await self._resolve_label_id(service, user_id, mailbox_id)
    pipeline = self._build_search_pipeline(query, user_id, mailbox_label_id, limit, page)
    
    logger.info(f"[SEARCH] Pipeline: {pipeline}")
    
    try:
      cursor = await self.email_index_collection.aggregate(pipeline)
      docs = await cursor.to_list(length=limit)
      logger.info(f"[SEARCH] Atlas search returned {len(docs)} docs")
    except Exception as e:
      logger.warning(f"[SEARCH] Atlas search failed: {e}, falling back to regex search")
      fallback_filter = {"user_id": user_id}
      if mailbox_label_id:
        fallback_filter["labels"] = mailbox_label_id
      regex = {"$regex": query, "$options": "i"}
      fallback_query = {
        "$or": [
          {"subject": regex},
          {"from_name": regex},
          {"from_email": regex},
          {"snippet": regex}
        ],
        **fallback_filter
      }
      logger.info(f"[SEARCH] Fallback query: {fallback_query}")
      docs = await self.email_index_collection.find(fallback_query).sort("received_on", -1).limit(limit).to_list(length=limit)
      logger.info(f"[SEARCH] Fallback search returned {len(docs)} docs")
    
    total_count = await self.email_index_collection.count_documents({"user_id": user_id})
    logger.info(f"[SEARCH] Total emails in index for user: {total_count}")
    
    results = []
    for doc in docs:
      labels = doc.get("labels", [])
      results.append({
        "id": doc.get("message_id"),
        "history_id": doc.get("history_id"),
        "subject": doc.get("subject", "(No Subject)"),
        "sender": {
          "name": doc.get("from_name") or "",
          "email": doc.get("from_email") or ""
        },
        "to": doc.get("to", []),
        "received_on": doc.get("received_on") or "",
        "unread": doc.get("unread", False),
        "tags": [{"id": l, "name": l} for l in labels],
        "body": doc.get("snippet", "")[:150],
        "has_attachments": doc.get("has_attachments", False)
      })
    
    logger.info(f"[SEARCH] Returning {len(results)} results")
    return results

  async def search_emails_semantic(self, user_id: str, query: str, mailbox_id: Optional[str], page: int, limit: int):
    logger.info(f"[SEMANTIC SEARCH] user_id={user_id}, query='{query}', mailbox_id={mailbox_id}, page={page}, limit={limit}")
    mailbox_label_id: Optional[str] = None
    if mailbox_id:
      try:
        service = await self.get_gmail_service(user_id)
        mailbox_label_id = await self._resolve_label_id(service, user_id, mailbox_id)
      except Exception as e:
        logger.warning(f"[SEMANTIC SEARCH] Failed to resolve mailbox label id: {e}")
    query_embedding = encode_texts([query])[0]
    vector_store = get_vector_store()
    top_k = page * limit + 10
    scored = vector_store.query(user_id, query_embedding, top_k, mailbox_label_id)
    
    if not scored:
      logger.info("[SEMANTIC SEARCH] No vectors found, attempting lazy rebuild from Mongo")
      await self._rebuild_semantic_index_for_user(user_id)
      scored = vector_store.query(user_id, query_embedding, top_k, mailbox_label_id)
      if not scored:
        logger.info("[SEMANTIC SEARCH] No vectors after rebuild, returning empty result")
        return []
        
    scored.sort(key=lambda x: x[1], reverse=True)
      
    message_ids = [m_id for m_id, _, _ in scored]
    unique_ids = list(dict.fromkeys(message_ids))
    cursor = self.email_index_collection.find(
      {"user_id": user_id, "message_id": {"$in": unique_ids}}
    )
    docs = await cursor.to_list(length=len(unique_ids))
    doc_by_id = {d.get("message_id"): d for d in docs}
    ordered_docs = [doc_by_id[m_id] for m_id in unique_ids if m_id in doc_by_id]
    start = (page - 1) * limit
    end = start + limit
    page_docs = ordered_docs[start:end]
    results = []
    for doc in page_docs:
      labels = doc.get("labels", [])
      results.append(
        {
          "id": doc.get("message_id"),
          "history_id": doc.get("history_id"),
          "subject": doc.get("subject", "(No Subject)"),
          "sender": {
            "name": doc.get("from_name") or "",
            "email": doc.get("from_email") or "",
          },
          "to": doc.get("to", []),
          "received_on": doc.get("received_on") or "",
          "unread": doc.get("unread", False),
          "tags": [{"id": l, "name": l} for l in labels],
          "body": doc.get("snippet", "")[:150],
          "has_attachments": doc.get("has_attachments", False),
        }
      )
    logger.info(f"[SEMANTIC SEARCH] Returning {len(results)} results")
    return results

  async def _rebuild_semantic_index_for_user(self, user_id: str, mailbox_id: Optional[str] = None) -> None:
    vector_store = get_vector_store()
    if vector_store.count(user_id) > 0:
      return
    
    filter_query: Dict[str, Any] = {"user_id": user_id}
    if mailbox_id:
      # Check if this is a kanban label (stored in DB labels collection)
      db_label = await self.labels_collection.find_one({
        "user_id": user_id,
        "name": mailbox_id
      })

      if db_label:
        # This is a kanban label, query by DB label ID
        filter_query["labels"] = {"$in": [db_label['label_id']]}
      else:
        # This is a Gmail system label, resolve Gmail label ID
        service = await self.get_gmail_service(user_id)
        gmail_label_id = await self._resolve_label_id(service, user_id, mailbox_id)
        if gmail_label_id:
          filter_query["labels"] = {"$in": [gmail_label_id]}
      
    logger.info(f"[SEMANTIC REBUILD] Generating embeddings for user {user_id} from emails...")
    email_cursor = self.email_index_collection.find(filter_query)
    batch_docs = []
    async for doc in email_cursor:
      batch_docs.append(doc)
      if len(batch_docs) >= 50:
        await self._upsert_embeddings_batch(user_id, batch_docs, vector_store)
        batch_docs = []
    if batch_docs:
      await self._upsert_embeddings_batch(user_id, batch_docs, vector_store)

  async def sync_all_users(self, mailbox_id: Optional[str] = None):
    """Sync all users with Gmail tokens."""
    await self.sync_service.sync_all_users(mailbox_id)
  async def get_gmail_service(self, user_id: str):
    # Try to find user with ObjectId first (most common case)
    user = None
    try:
        user = await self.users_collection.find_one({"_id": ObjectId(user_id)})
    except:
        # If ObjectId conversion fails, try with string directly
        user = await self.users_collection.find_one({"_id": user_id})

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

    return build("gmail", "v1", credentials=creds, cache_discovery=False)

  async def get_mailboxes(self, user_id: str):
    """Get mailboxes from DB labels collection first, fallback to Gmail API."""
    try:
      # Try to get labels from DB first
      db_labels = await self.labels_collection.find({"user_id": user_id}).to_list(length=None)

      if db_labels:
        # Convert DB labels to mailbox format
        mailboxes = []
        for label in db_labels:
          # Count emails with this label
          unread_count = await self.emails_collection.count_documents({
            "user_id": user_id,
            "labels": label['label_id'],
            "unread": True
          })
          total_count = await self.emails_collection.count_documents({
            "user_id": user_id,
            "labels": label['label_id']
          })

          mailboxes.append({
            "id": label['label_id'],
            "name": label['name'],
            "type": label.get('type', 'user'),
            "unread_count": unread_count,
            "total_count": total_count
          })

        # Add system labels that might not be in DB
        system_labels = ['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'STARRED', 'IMPORTANT']
        for sys_label in system_labels:
          if not any(mb['id'] == sys_label for mb in mailboxes):
            unread_count = await self.emails_collection.count_documents({
              "user_id": user_id,
              "labels": sys_label,
              "unread": True
            })
            total_count = await self.emails_collection.count_documents({
              "user_id": user_id,
              "labels": sys_label
            })

            mailboxes.append({
              "id": sys_label,
              "name": sys_label.lower().capitalize(),
              "type": "system",
              "unread_count": unread_count,
              "total_count": total_count
            })

        return mailboxes
      else:
        # Fallback to Gmail API and sync to DB
        logger.warning("No labels found in DB, falling back to Gmail API")
        return await self._get_mailboxes_fallback(user_id)

    except Exception as e:
      logger.warning(f"DB query failed for get_mailboxes, falling back to Gmail API: {e}")
      return await self._get_mailboxes_fallback(user_id)

  async def _get_mailboxes_fallback(self, user_id: str):
    """Fallback implementation using Gmail API."""
    service = await self.get_gmail_service(user_id)
    results = service.users().labels().list(userId='me').execute()
    labels = results.get('labels', [])

    # Sync labels to DB in background
    for label in labels:
      await self.labels_collection.update_one(
        {"user_id": user_id, "label_id": label['id']},
        {
          "$set": {
            "user_id": user_id,
            "label_id": label['id'],
            "name": label['name'],
            "type": label.get('type', 'user'),
            "updated_at": datetime.utcnow().isoformat()
          },
          "$setOnInsert": {"created_at": datetime.utcnow().isoformat()}
        },
        upsert=True
      )

    return [
      {
        "id": label['id'],
        "name": label['name'],
        "type": label.get("type", "user"),
        "unread_count": label.get("messagesUnread", 0),
        "total_count": label.get("messagesTotal", 0)
      }
      for label in labels
    ]

  async def get_all_labels(self, user_id: str):
    service = await self.get_gmail_service(user_id)
    results = service.users().labels().list(userId='me').execute()
    labels = results.get('labels', [])
    return [
      {
        "id": label['id'],
        "name": label['name'],
        "type": label.get("type", "user"),
        "messagesTotal": label.get("messagesTotal", 0),
        "messagesUnread": label.get("messagesUnread", 0)
      }
      for label in labels
    ]

  async def create_label(self, user_id: str, label_name: str):
    service = await self.get_gmail_service(user_id)
    label_id = await self._get_or_create_label_id(service, user_id, label_name)
    
    try:
      label = service.users().labels().get(userId='me', id=label_id).execute()
      return {
        "id": label['id'],
        "name": label['name'],
        "type": label.get("type", "user")
      }
    except Exception as e:
      print(f"Error fetching created label: {e}")
      return {
        "id": label_id,
        "name": label_name,
        "type": "user"
      }

  def _has_attachments(self, payload: dict) -> bool:
    def check_parts(parts):
      if not parts:
        return False
      for part in parts:
        if part.get('filename'):
          return True
        if part.get('parts') and check_parts(part.get('parts')):
          return True
      return False
    
    if payload.get('parts'):
      return check_parts(payload.get('parts'))
    
    return bool(payload.get('filename'))

  async def get_emails(self, user_id: str, mailbox_id: str, page_token: str = None, limit: int = 50, summarize: bool = False):
    """Get emails from DB first, fallback to Gmail API if needed."""
    try:
      # Check if this is a kanban label (stored in DB labels collection)
      db_label = await self.labels_collection.find_one({
        "user_id": user_id,
        "name": mailbox_id
      })

      if db_label:
        # This is a kanban label, query by DB label ID
        query_label_id = db_label['label_id']
      else:
        # This is a Gmail system label, resolve Gmail label ID
        service = await self.get_gmail_service(user_id)
        query_label_id = await self._resolve_label_id(service, user_id, mailbox_id)

      # Parse pagination
      skip = 0
      if page_token:
        try:
          skip = int(page_token)
        except ValueError:
          skip = 0

      # Query DB for emails
      query = {"user_id": user_id}
      if query_label_id:
        query["labels"] = {"$in": [query_label_id]}

      cursor = self.emails_collection.find(query).sort("received_on", -1).skip(skip).limit(limit)
      email_docs = await cursor.to_list(length=limit)

      # Get total count for result_size_estimate
      total_count = await self.emails_collection.count_documents(query)

      thread_list = []
      for doc in email_docs:
        # Convert EmailDocument to ThreadPreview format
        summary_text = None
        if summarize and doc.get("body"):
          try:
            summary_text = await self._get_summarizer().summarize(doc.get("body", ""))
          except Exception as e:
            logger.warning(f"Summarize failed for {doc.get('message_id')}: {e}")

        thread_list.append({
          "id": doc["message_id"],
          "history_id": doc.get("history_id"),
          "subject": doc.get("subject", "(No Subject)"),
          "sender": {
            "name": doc.get("from_name", ""),
            "email": doc.get("from_email", "")
          },
          "to": doc.get("to", []),
          "received_on": doc.get("received_on", ""),
          "unread": doc.get("unread", False),
          "tags": doc.get("tags", []),
          "body": doc.get("snippet", ""),
          "summary": summary_text,
          "has_attachments": doc.get("has_attachments", False)
        })

      # Calculate next page token
      next_page_token = None
      if len(email_docs) == limit and (skip + limit) < total_count:
        next_page_token = str(skip + limit)

      return {
        "threads": thread_list,
        "next_page_token": next_page_token,
        "result_size_estimate": total_count
      }

    except Exception as e:
      logger.warning(f"DB query failed for get_emails, falling back to Gmail API: {e}")
      # Fallback to original Gmail API implementation
      return await self._get_emails_fallback(user_id, mailbox_id, page_token, limit, summarize)

  async def _get_emails_fallback(self, user_id: str, mailbox_id: str, page_token: str = None, limit: int = 50, summarize: bool = False):
    """Fallback implementation using Gmail API directly."""
    service = await self.get_gmail_service(user_id)

    system_labels_map = {
        'inbox': 'INBOX',
        'sent': 'SENT',
        'trash': 'TRASH',
        'drafts': 'DRAFT',
        'spam': 'SPAM',
        'starred': 'STARRED',
        'important': 'IMPORTANT'
    }

    gmail_label_id = system_labels_map.get(mailbox_id.lower())

    if not gmail_label_id:
        try:
            results = service.users().labels().list(userId='me').execute()
            labels = results.get('labels', [])

            search_name = mailbox_id.lower()
            if search_name == 'todo':
                search_name = 'to do'

            for label in labels:
                if label['name'].lower() == search_name:
                    gmail_label_id = label['id']
                    break

            if not gmail_label_id:
                logger.warning(f"Label '{mailbox_id}' not found in Gmail account.")
                return {
                    "threads": [],
                    "next_page_token": None,
                    "result_size_estimate": 0
                }
        except Exception as e:
            logger.error(f"Error resolving label ID: {e}")
            return {"threads": [], "next_page_token": None, "result_size_estimate": 0}

    try:
        results = service.users().messages().list(
          userId='me',
          labelIds=[gmail_label_id],
          maxResults=limit,
          pageToken=page_token
        ).execute()
    except Exception as e:
        logger.error(f"Error fetching messages from Gmail: {e}")
        return {"threads": [], "next_page_token": None, "result_size_estimate": 0}

    messages = results.get('messages', [])
    next_page_token = results.get('nextPageToken', None)
    result_size_estimate = results.get('resultSizeEstimate', 0)

    thread_list = []

    for msg in messages:
      try:
          msg_data = service.users().messages().get(
            userId='me',
            id=msg['id'],
            format='full'
          ).execute()

          payload = msg_data.get('payload', {})
          headers = payload.get('headers', [])

          def get_header(name):
            return next((h['value'] for h in headers if h['name'].lower() == name.lower()), '')

          from_header = get_header('From')
          if from_header:
              name, email_addr = email.utils.parseaddr(from_header)
              sender_obj = {"name": name, "email": email_addr}
          else:
              sender_obj = {"name": "Unknown", "email": ""}

          to_header = get_header('To')
          to_list = []
          if to_header:
              to_list = [{"name": n, "email": e} for n, e in email.utils.getaddresses([to_header])]

          subject = get_header('Subject') or '(No Subject)'

          internal_date = msg_data.get('internalDate')
          received_on = datetime.fromtimestamp(int(internal_date)/1000).isoformat() if internal_date else ""

          preview_body = msg_data.get('snippet', '')
          summary_text = None
          if summarize:
              try:
                  summary_text = await self._get_summarizer().summarize(preview_body)
              except Exception as e:
                  logger.warning(f"Summarize preview failed for {msg.get('id')}: {e}")

          has_attachments = self._has_attachments(payload)

          thread_list.append({
            "id": msg['id'],
            "history_id": msg_data.get('historyId'),
            "subject": subject,
            "sender": sender_obj,
            "to": to_list,
            "received_on": received_on,
            "unread": "UNREAD" in msg_data.get('labelIds', []),
            "tags": [{"id": l, "name": l} for l in msg_data.get('labelIds', [])],
            "body": preview_body,
            "summary": summary_text,
            "has_attachments": has_attachments
          })
      except Exception as e:
          logger.error(f"Error processing message {msg.get('id')}: {e}")
          continue

    return {
      "threads": thread_list,
      "next_page_token": next_page_token,
      "result_size_estimate": result_size_estimate
    }

  async def get_email_detail(self, user_id: str, email_id: str, summarize: bool = False) -> ThreadDetailResponse:
    """Get email thread detail from DB first, fallback to Gmail API if needed."""
    try:
      # First try to find the message in DB
      email_doc = await self.emails_collection.find_one({"user_id": user_id, "message_id": email_id})
      if email_doc:
        thread_id = email_doc["thread_id"]
      else:
        # Fallback: get thread_id from Gmail API
        service = await self.get_gmail_service(user_id)
        try:
            msg_metadata = service.users().messages().get(userId='me', id=email_id, format='minimal').execute()
            thread_id = msg_metadata.get('threadId')
        except Exception:
            raise ValueError("Message not found")

      # Query all messages in the thread from DB
      thread_docs = await self.emails_collection.find(
        {"user_id": user_id, "thread_id": thread_id}
      ).sort("received_on", 1).to_list(length=None)

      if thread_docs:
        # Convert DB documents to ParsedMessage format
        parsed_messages = []
        for doc in thread_docs:
          parsed = self._convert_email_doc_to_parsed_message(doc)
          if summarize:
            try:
              parsed.summary = await self._get_summarizer().summarize(parsed.body)
            except Exception as e:
              logger.warning(f"Summarize detail failed for {doc.get('message_id')}: {e}")
          parsed_messages.append(parsed)

        latest = parsed_messages[-1] if parsed_messages else None

        return {
          "messages": parsed_messages,
          "latest": latest,
          "has_unread": any(m.unread for m in parsed_messages),
          "total_replies": len(parsed_messages) - 1 if parsed_messages else 0,
          "labels": latest.tags if latest else [],
          "is_latest_draft": False
        }
      else:
        # Fallback to Gmail API if no documents found in DB
        logger.warning(f"Thread {thread_id} not found in DB, falling back to Gmail API")
        return await self._get_email_detail_fallback(user_id, email_id, summarize)

    except Exception as e:
      logger.warning(f"DB query failed for get_email_detail, falling back to Gmail API: {e}")
      return await self._get_email_detail_fallback(user_id, email_id, summarize)

  def _convert_email_doc_to_parsed_message(self, email_doc: dict) -> ParsedMessage:
    """Convert EmailDocument dict to ParsedMessage format."""
    return ParsedMessage(
      id=email_doc["message_id"],
      thread_id=email_doc["thread_id"],
      title=email_doc.get("subject", "(No Subject)"),
      subject=email_doc.get("subject", "(No Subject)"),
      sender=Sender(
        name=email_doc.get("from_name", ""),
        email=email_doc.get("from_email", "")
      ),
      to=email_doc.get("to", []),
      cc=email_doc.get("cc", []),
      bcc=email_doc.get("bcc", []),
      received_on=email_doc.get("received_on", ""),
      unread=email_doc.get("unread", False),
      body=email_doc.get("body", ""),
      processed_html=email_doc.get("processed_html", ""),
      decoded_body=email_doc.get("decoded_body"),
      tags=email_doc.get("tags", []),
      attachments=email_doc.get("attachments"),
      message_id=email_doc.get("message_id_header"),
      references=email_doc.get("references"),
      in_reply_to=email_doc.get("in_reply_to")
    )

  async def _get_email_detail_fallback(self, user_id: str, email_id: str, summarize: bool = False) -> ThreadDetailResponse:
    """Fallback implementation using Gmail API directly."""
    service = await self.get_gmail_service(user_id)

    try:
        msg_metadata = service.users().messages().get(userId='me', id=email_id, format='minimal').execute()
        thread_id = msg_metadata.get('threadId')
    except Exception:
        raise ValueError("Message not found")

    thread_data = service.users().threads().get(userId='me', id=thread_id, format='full').execute()
    messages = thread_data.get('messages', [])

    parsed_messages = []
    for msg in messages:
        parsed = self._parse_gmail_message(msg)
        if summarize:
            try:
                parsed.summary = await self._get_summarizer().summarize(parsed.body)
            except Exception as e:
                logger.warning(f"Summarize detail failed for {msg.get('id')}: {e}")
        parsed_messages.append(parsed)

    parsed_messages.sort(key=lambda x: x.received_on)

    latest = parsed_messages[-1] if parsed_messages else None

    return {
        "messages": parsed_messages,
        "latest": latest,
        "has_unread": any(m['unread'] for m in parsed_messages),
        "total_replies": len(parsed_messages) - 1 if parsed_messages else 0,
        "labels": latest['tags'] if latest else [],
        "is_latest_draft": False
    }

  def _parse_gmail_message(self, msg_data: dict) -> ParsedMessage:
      payload = msg_data.get('payload', {})
      headers = payload.get('headers', [])
      
      def get_header(name):
          return next((h['value'] for h in headers if h['name'].lower() == name.lower()), '')
      
      def get_header_list(name):
          val = get_header(name)
          if not val: return []
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
          data = payload.get('body', {}).get('data')
          mime_type = payload.get('mimeType')
          if data:
              decoded = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
              if mime_type == 'text/html':
                  body_html = decoded
              else:
                  body_text = decoded

      processed_html = body_html or f"<pre>{body_text}</pre>"
      
      try:
          _email_html_logger.info(f"\n{'='*80}\n")
          _email_html_logger.info(f"Email ID: {msg_data['id']}")
          _email_html_logger.info(f"Subject: {subject}")
          _email_html_logger.info(f"From: {sender.get('email', 'Unknown')}")
          _email_html_logger.info(f"Has HTML: {bool(body_html)}")
          _email_html_logger.info(f"Has Text: {bool(body_text)}")
          _email_html_logger.info(f"Processed HTML Length: {len(processed_html)}")
          _email_html_logger.info(f"\n--- PROCESSED HTML CONTENT ---\n{processed_html}\n")
          _email_html_logger.info(f"{'='*80}\n")
      except Exception as e:
          logger.warning(f"Failed to log email HTML for {msg_data['id']}: {e}")

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
          "body": body_text or body_html,
          "processed_html": processed_html,
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
          msg = MIMEText(body, 'html')
          message.attach(msg)
          
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
          message['subject'] = reply_data.get('subject')
          message['In-Reply-To'] = message_id
          message['References'] = references
          
          body = reply_data.get('body', '')
          msg = MIMEText(body, 'html')
          message.attach(msg)
          
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
      """Modify email properties in DB only (DB-first approach)."""
      logger.info(f"[MODIFY EMAIL] user_id={user_id}, email_id={email_id}, updates={updates}")

      # Find the email document in DB
      email_doc = await self.emails_collection.find_one({"user_id": user_id, "message_id": email_id})
      if not email_doc:
          raise ValueError(f"Email {email_id} not found in database")

      # Prepare updates for DB
      db_updates = {}
      new_labels = list(email_doc.get('labels', []))
      new_tags = list(email_doc.get('tags', []))

      # Handle unread status
      if 'unread' in updates:
          if updates['unread']:
              if 'UNREAD' not in new_labels:
                  new_labels.append('UNREAD')
              db_updates['unread'] = True
          else:
              if 'UNREAD' in new_labels:
                  new_labels.remove('UNREAD')
              db_updates['unread'] = False

      # Handle starred status
      if 'starred' in updates:
          if updates['starred']:
              if 'STARRED' not in new_labels:
                  new_labels.append('STARRED')
          else:
              if 'STARRED' in new_labels:
                  new_labels.remove('STARRED')

      # Handle trash
      if updates.get('trash'):
          if 'TRASH' not in new_labels:
              new_labels.append('TRASH')
          # Remove INBOX when moving to trash
          if 'INBOX' in new_labels:
              new_labels.remove('INBOX')

      # Handle label changes (kanban column management)
      if 'labels' in updates:
          labels_to_add = updates.get('labels', [])

          # Remove existing kanban labels before adding new ones
          # Get all user labels (kanban labels) for this user
          user_labels = await self.labels_collection.find({"user_id": user_id}).to_list(length=None)
          kanban_label_ids = [label['label_id'] for label in user_labels]

          # Remove all existing kanban labels
          new_labels = [label for label in new_labels if label not in kanban_label_ids]

          # Also remove kanban label tags
          new_tags = [tag for tag in new_tags if tag['id'] not in kanban_label_ids]

          # Get or create DB labels for the new labels
          for label_name in labels_to_add:
              label_id = await self._get_or_create_db_label_id(user_id, label_name)
              if label_id not in new_labels:
                  new_labels.append(label_id)

              # Add to tags if not already present
              if not any(tag['id'] == label_id for tag in new_tags):
                  new_tags.append({'id': label_id, 'name': label_name})

          # Keep INBOX when moving to kanban column - email can be in both INBOX and kanban column

      # Update the document in DB
      if new_labels != email_doc.get('labels', []):
          db_updates['labels'] = new_labels
      if new_tags != email_doc.get('tags', []):
          db_updates['tags'] = new_tags

      if db_updates:
          db_updates['updated_at'] = datetime.utcnow().isoformat()
          await self.emails_collection.update_one(
              {"user_id": user_id, "message_id": email_id},
              {"$set": db_updates}
          )
          logger.info(f"[MODIFY EMAIL] Updated email {email_id} in DB: {db_updates}")

          # Sync changes with Gmail API
          await self._sync_email_modifications_with_gmail(user_id, email_id, updates, new_labels)

      return await self.get_email_detail(user_id, email_id)

  async def _sync_email_modifications_with_gmail(self, user_id: str, email_id: str, updates: dict, new_labels: list):
      """Sync email modifications with Gmail API."""
      try:
          service = await self.get_gmail_service(user_id)

          # Prepare Gmail API modify request
          modify_request = {}

          # Handle unread status
          if 'unread' in updates:
              if updates['unread']:
                  modify_request['addLabelIds'] = modify_request.get('addLabelIds', []) + ['UNREAD']
                  modify_request['removeLabelIds'] = modify_request.get('removeLabelIds', []) + ['UNREAD']
              else:
                  modify_request['removeLabelIds'] = modify_request.get('removeLabelIds', []) + ['UNREAD']

          # Handle starred status
          if 'starred' in updates:
              if updates['starred']:
                  modify_request['addLabelIds'] = modify_request.get('addLabelIds', []) + ['STARRED']
              else:
                  modify_request['removeLabelIds'] = modify_request.get('removeLabelIds', []) + ['STARRED']

          # Handle trash
          if updates.get('trash'):
              modify_request['addLabelIds'] = modify_request.get('addLabelIds', []) + ['TRASH']
              modify_request['removeLabelIds'] = modify_request.get('removeLabelIds', []) + ['INBOX']

          # Handle label changes - skip kanban labels as they're app-specific
          if 'labels' in updates:
              # Kanban labels (todo, done, etc.) are app-specific and shouldn't sync to Gmail
              # They are preserved in DB sync but not synced to Gmail
              pass

          # Only call Gmail API if there are changes to sync
          if modify_request:
              # Call Gmail API to modify the message
              result = service.users().messages().modify(
                  userId='me',
                  id=email_id,
                  body=modify_request
              ).execute()

              logger.info(f"[GMAIL SYNC] Synced email {email_id} modifications with Gmail: {modify_request}")
              return result

      except Exception as e:
          logger.error(f"[GMAIL SYNC] Failed to sync email {email_id} with Gmail: {e}")
          # Don't raise exception - DB changes should still be preserved even if Gmail sync fails

  async def _get_or_create_db_label_id(self, user_id: str, label_name: str) -> str:
      """Get or create a label ID in DB labels collection."""
      # Check if label exists
      existing = await self.labels_collection.find_one({
          "user_id": user_id,
          "name": label_name
      })

      if existing:
          return existing['label_id']

      # Create new label
      from app.utils.id_generator import generate_id
      label_id = f"Label_{generate_id()}"

      now = datetime.utcnow().isoformat()
      await self.labels_collection.insert_one({
          "user_id": user_id,
          "label_id": label_id,
          "name": label_name,
          "type": "user",
          "created_at": now,
          "updated_at": now
      })

      return label_id

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

  async def summarize_email(self, user_id: str, email_id: str) -> dict:
      detail = await self.get_email_detail(user_id, email_id, summarize=False)
      latest = detail.get("latest") if isinstance(detail, dict) else detail.latest  # detail is dict-like

      body = ""
      if isinstance(latest, dict):
          body = latest.get("body", "") or latest.get("decoded_body", "") or ""
      else:
          body = getattr(latest, "body", "") or getattr(latest, "decoded_body", "") or ""

      summary_text = ""
      try:
          summary_text = await self._get_summarizer().summarize(body)
      except Exception as e:
          logger.warning(f"Summarize single email failed for {email_id}: {e}")
          summary_text = ""

      return {"email_id": email_id, "summary": summary_text}

  async def _get_or_create_label_id(self, service, user_id: str, label_name: str) -> str:
      SYSTEM_LABELS = {'INBOX': 'INBOX', 'TRASH': 'TRASH', 'SPAM': 'SPAM', 'UNREAD': 'UNREAD', 'STARRED': 'STARRED', 'SNOOZED': 'SNOOZED'}
      label_upper = label_name.upper()
      
      if label_upper in SYSTEM_LABELS:
          return SYSTEM_LABELS[label_upper]

      display_name = label_name.strip()
      
      special_cases = {
          'todo': 'To Do',
          'done': 'Done',
      }
      if label_name.lower() in special_cases:
          display_name = special_cases[label_name.lower()]
      
      try:
          results = service.users().labels().list(userId='me').execute()
          labels = results.get('labels', [])
          
          for label in labels:
              if label['name'].lower() == display_name.lower():
                  print(f"Found existing label: {label['name']} (id: {label['id']})")
                  return label['id']

          print(f"Creating new label: {display_name}")
          created_label = service.users().labels().create(
              userId='me', 
              body={
                  'name': display_name,
                  'labelListVisibility': 'labelShow',
                  'messageListVisibility': 'show'
              }
          ).execute()
          print(f"Label created successfully: {created_label['name']} (id: {created_label['id']})")
          return created_label['id']
          
      except Exception as e:
          print(f"Error getting/creating label {label_name}: {str(e)}")
          import traceback
          traceback.print_exc()
          return label_name

  async def snooze_email(self, user_id: str, email_id: str, snooze_until: datetime):
    """Snooze email by updating DB records only (DB-first approach)."""
    snooze_until_utc = (
        snooze_until.replace(tzinfo=timezone.utc)
        if snooze_until.tzinfo is None
        else snooze_until.astimezone(timezone.utc)
    )

    # Get current email document
    email_doc = await self.emails_collection.find_one({"user_id": user_id, "message_id": email_id})
    if not email_doc:
        raise ValueError(f"Email {email_id} not found in database")

    current_labels = email_doc.get('labels', [])

    # Get or create SNOOZED label in DB
    snooze_label_id = await self._get_or_create_db_label_id(user_id, "SNOOZED")

    # Update email labels in DB (add SNOOZED, remove INBOX)
    new_labels = [label for label in current_labels if label != 'INBOX']
    if snooze_label_id not in new_labels:
        new_labels.append(snooze_label_id)

    now_utc = datetime.utcnow().replace(tzinfo=timezone.utc)
    await self.emails_collection.update_one(
        {"user_id": user_id, "message_id": email_id},
        {"$set": {"labels": new_labels, "updated_at": now_utc.isoformat()}}
    )

    # Create snooze schedule record
    await self.snooze_schedules_collection.update_one(
        {"email_id": email_id, "user_id": user_id},
        {
            "$set": {
                "user_id": user_id,
                "email_id": email_id,
                "snooze_until": snooze_until_utc.isoformat(),
                "status": "active",
                "original_labels": current_labels,
                "updated_at": now_utc.isoformat(),
            },
            "$setOnInsert": {"created_at": now_utc.isoformat()},
        },
        upsert=True
    )

    return {"message": f"Email snoozed until {snooze_until_utc.isoformat()}"}

  async def check_and_restore_snoozed_emails(self):
    """Restore expired snoozed emails by updating DB records only."""
    now_utc = datetime.utcnow().replace(tzinfo=timezone.utc)
    cursor = self.snooze_schedules_collection.find({
        "snooze_until": {"$lte": now_utc.isoformat()},
        "status": "active"
    })

    async for record in cursor:
        user_id = record["user_id"]
        email_id = record["email_id"]
        original_labels = record.get("original_labels") or ["INBOX"]

        try:
            logger.info(f"[SNOOZE WORKER] Restoring email {email_id} for user {user_id}")

            # Get snooze label ID
            snooze_label_id = await self._get_or_create_db_label_id(user_id, "SNOOZED")

            # Update email labels in DB (restore original labels, remove SNOOZED)
            labels_to_restore = [label for label in original_labels if label != "SNOOZED"]

            await self.emails_collection.update_one(
                {"user_id": user_id, "message_id": email_id},
                {
                    "$set": {
                        "labels": labels_to_restore,
                        "updated_at": now_utc.isoformat()
                    }
                }
            )

            # Mark snooze schedule as processed
            await self.snooze_schedules_collection.update_one(
                {"_id": record["_id"]},
                {"$set": {
                    "status": "processed",
                    "restored_at": now_utc.isoformat(),
                    "updated_at": now_utc.isoformat(),
                    "last_error": None
                }}
            )

            logger.info(f"[SNOOZE WORKER] Successfully restored email {email_id}")

        except Exception as e:
            logger.error(f"[SNOOZE WORKER] Error restoring email {email_id}: {e}")
            await self.snooze_schedules_collection.update_one(
                {"_id": record["_id"]},
                {"$set": {
                    "status": "error",
                    "last_error": str(e),
                    "updated_at": now_utc.isoformat()
                }}
            )

  async def process_embedding_queue(self):
    try:
      batch_size = settings.EMBEDDING_BATCH_SIZE
      cursor = self.email_index_collection.find(
        {"is_embedded": {"$ne": True}},
        limit=batch_size
      ).sort("received_on", -1)
      
      docs = await cursor.to_list(length=batch_size)
      
      if not docs:
        return

      logger.info(f"Processing embedding for {len(docs)} emails")
      
      # Group by user_id
      docs_by_user = {}
      for doc in docs:
        uid = doc["user_id"]
        if uid not in docs_by_user:
          docs_by_user[uid] = []
        docs_by_user[uid].append(doc)
      
      vector_store = get_vector_store()
      for uid, user_docs in docs_by_user.items():
        await self._upsert_embeddings_batch(uid, user_docs, vector_store)
      
      # Update is_embedded flag
      message_ids = [d["message_id"] for d in docs]
      await self.email_index_collection.update_many(
        {"message_id": {"$in": message_ids}},
        {"$set": {"is_embedded": True}}
      )
      
      logger.info(f"Successfully embedded {len(docs)} emails")
      
    except Exception as e:
      logger.error(f"Error in process_embedding_queue: {e}")

  async def run_sync_loop(self):
    """Run the periodic email sync loop for all users."""
    import asyncio
    from app.config import settings

    logger.info("[SYNC LOOP] Starting email sync loop")

    while True:
      try:
        logger.info("[SYNC LOOP] Running periodic sync for all users")
        await self.sync_all_users()
        logger.info("[SYNC LOOP] Periodic sync completed")

        # Also run embedding processing
        await self.process_embedding_queue()
        logger.info("[SYNC LOOP] Embedding processing completed")

      except Exception as e:
        logger.error(f"[SYNC LOOP] Error in sync loop: {e}")

      # Sleep for configured interval
      await asyncio.sleep(settings.MAIL_SYNC_INTERVAL_SECONDS)
