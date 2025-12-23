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

# Setup email HTML logger
_email_html_logger = logging.getLogger('email_html')
_email_html_logger.setLevel(logging.INFO)
_email_html_logger.propagate = False  # Don't propagate to root logger

# Create logs directory if it doesn't exist
os.makedirs("logs", exist_ok=True)

# Create file handler for email HTML logging
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
    Attachment
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
    self._summarizer: Optional[Summarizer] = None

  def _get_summarizer(self) -> Summarizer:
    if self._summarizer is None:
      self._summarizer = Summarizer()
    return self._summarizer

  async def _resolve_label_id(self, service, user_id: str, mailbox_id: Optional[str]) -> Optional[str]:
    if not mailbox_id:
      return None
    
    # System labels must be uppercase
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
    
    # Check if it's a system label (case-insensitive)
    gmail_label_id = system_labels_map.get(mailbox_id.lower())
    if gmail_label_id:
      return gmail_label_id
    
    # For user labels, find by exact name match (case-insensitive)
    try:
      results = service.users().labels().list(userId='me').execute()
      labels = results.get('labels', [])
      
      # Special handling for common names
      search_name = mailbox_id
      if mailbox_id.lower() == 'todo':
        search_name = 'To Do'
      elif mailbox_id.lower() == 'done':
        search_name = 'Done'
      
      # Find matching label (case-insensitive comparison)
      for label in labels:
        if label['name'].lower() == search_name.lower():
          gmail_label_id = label['id']
          break
    except Exception as e:
      print(f"Error resolving label {mailbox_id}: {e}")
      gmail_label_id = None
    
    return gmail_label_id

  def _parse_message_for_index(self, msg_data: dict, user_id: str) -> dict:
    payload = msg_data.get('payload', {})
    headers = payload.get('headers', [])
    def get_header(name: str) -> str:
      return next((h['value'] for h in headers if h['name'].lower() == name.lower()), '')
    subject = get_header('Subject') or '(No Subject)'
    from_header = get_header('From')
    name, email_addr = email.utils.parseaddr(from_header)
    internal_date = msg_data.get('internalDate')
    received_on = datetime.fromtimestamp(int(internal_date) / 1000).isoformat() if internal_date else ""
    label_ids = msg_data.get('labelIds', [])
    snippet = msg_data.get('snippet', '') or ''
    to_header = get_header('To')
    to_list = []
    if to_header:
      to_list = [{"name": n, "email": e} for n, e in email.utils.getaddresses([to_header])]
    return {
      "user_id": user_id,
      "message_id": msg_data.get('id'),
      "thread_id": msg_data.get('threadId'),
      "history_id": msg_data.get('historyId'),
      "subject": subject,
      "from_name": name,
      "from_email": email_addr,
      "snippet": snippet,
      "received_on": received_on,
      "labels": label_ids,
      "to": to_list,
      "unread": "UNREAD" in label_ids
    }

  def _build_embedding_text(self, doc: Dict[str, Any]) -> str:
    subject = doc.get("subject") or ""
    from_name = doc.get("from_name") or ""
    from_email = doc.get("from_email") or ""
    snippet = doc.get("snippet") or ""
    return f"Subject: {subject}\nFrom: {from_name} <{from_email}>\nSnippet: {snippet}"

  async def _upsert_index_doc(self, doc: dict):
    now = datetime.utcnow().isoformat()
    doc["updated_at"] = now
    await self.email_index_collection.update_one(
      {"user_id": doc["user_id"], "message_id": doc["message_id"]},
      {"$set": doc, "$setOnInsert": {"created_at": now}},
      upsert=True
    )

  async def _sync_from_history(self, service, user_id: str, start_history_id: str, mailbox_label_id: Optional[str], max_pages: int = 3) -> Optional[str]:
    page_token = None
    latest_history_id = start_history_id
    processed: Set[str] = set()
    pages = 0
    vector_store = get_vector_store()
    while pages < max_pages:
      history_request = service.users().history().list(
        userId='me',
        startHistoryId=start_history_id,
        labelId=mailbox_label_id,
        historyTypes=['messageAdded', 'labelsAdded', 'labelsRemoved'],
        pageToken=page_token,
        maxResults=200
      )
      history_response = history_request.execute()
      histories = history_response.get('history', [])
      for record in histories:
        latest_history_id = record.get('id', latest_history_id)
        batch_docs: List[Dict[str, Any]] = []
        for msg_entry in record.get('messages', []):
          msg_id = msg_entry.get('id')
          if not msg_id or msg_id in processed:
            continue
          processed.add(msg_id)
          try:
            msg_data = service.users().messages().get(userId='me', id=msg_id, format='metadata').execute()
            doc = self._parse_message_for_index(msg_data, user_id)
            await self._upsert_index_doc(doc)
            batch_docs.append(doc)
          except Exception:
            continue
        for added in record.get('messagesAdded', []):
          msg_obj = added.get('message', {})
          msg_id = msg_obj.get('id')
          if not msg_id or msg_id in processed:
            continue
          processed.add(msg_id)
          try:
            msg_data = service.users().messages().get(userId='me', id=msg_id, format='metadata').execute()
            doc = self._parse_message_for_index(msg_data, user_id)
            await self._upsert_index_doc(doc)
            batch_docs.append(doc)
          except Exception:
            continue
        await self._upsert_embeddings_batch(user_id, batch_docs, vector_store)
      page_token = history_response.get('nextPageToken')
      pages += 1
      if not page_token:
        break
    return latest_history_id

  async def _full_resync(self, service, user_id: str, mailbox_label_id: Optional[str], lookback_days: int = 90, max_pages: int = 5) -> Optional[str]:
    cutoff = datetime.utcnow() - timedelta(days=lookback_days)
    query_parts = [f"after:{int(cutoff.timestamp())}"]
    page_token = None
    pages = 0
    latest_history_id = None
    vector_store = get_vector_store()
    while pages < max_pages:
      try:
        results = service.users().messages().list(
          userId='me',
          labelIds=[mailbox_label_id] if mailbox_label_id else None,
          q=" ".join(query_parts),
          maxResults=100,
          pageToken=page_token
        ).execute()
      except Exception:
        break
      messages = results.get('messages', [])
      batch_docs: List[Dict[str, Any]] = []
      for msg in messages:
        try:
          msg_data = service.users().messages().get(
            userId='me',
            id=msg['id'],
            format='metadata'
          ).execute()
          latest_history_id = msg_data.get('historyId') or latest_history_id
          doc = self._parse_message_for_index(msg_data, user_id)
          await self._upsert_index_doc(doc)
          batch_docs.append(doc)
        except Exception:
          continue
      await self._upsert_embeddings_batch(user_id, batch_docs, vector_store)
      page_token = results.get('nextPageToken')
      pages += 1
      if not page_token:
        break
    return latest_history_id

  async def sync_email_index(self, user_id: str, mailbox_id: Optional[str] = None, lookback_days: int = 90, max_pages: int = 5):
    service = await self.get_gmail_service(user_id)
    mailbox_label_id = await self._resolve_label_id(service, user_id, mailbox_id)
    state = await self.sync_state_collection.find_one({"user_id": user_id})
    history_id = state.get("history_id") if state else None
    latest_history_id = None
    if history_id:
      try:
        latest_history_id = await self._sync_from_history(service, user_id, history_id, mailbox_label_id, max_pages=2)
      except Exception:
        latest_history_id = None
    if not latest_history_id:
      latest_history_id = await self._full_resync(service, user_id, mailbox_label_id, lookback_days, max_pages)
    if latest_history_id:
      await self.sync_state_collection.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "history_id": latest_history_id, "updated_at": datetime.utcnow().isoformat()}},
        upsert=True
      )

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
    
    # Check if email_index_collection has any data at all
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
        
    # Sort by score descending to ensure best matches are first
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
      filter_query["labels"] = mailbox_id
      
    # Directly generate embeddings from email_index
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
    cursor = self.users_collection.find({"google_refresh_token": {"$exists": True}})
    async for user in cursor:
      user_id = str(user["_id"])
      try:
        await self.sync_email_index(
          user_id,
          mailbox_id,
          lookback_days=settings.MAIL_SYNC_LOOKBACK_DAYS,
          max_pages=settings.MAIL_SYNC_MAX_PAGES
        )
      except Exception as e:
        logger.warning(f"[MAIL SYNC] Failed for user {user_id}: {e}")
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

  async def get_all_labels(self, user_id: str):
    """Get all Gmail labels with full details."""
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
    """Create a new Gmail label."""
    service = await self.get_gmail_service(user_id)
    label_id = await self._get_or_create_label_id(service, user_id, label_name)
    
    # Fetch the created label details
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
    """
    Check if a Gmail message payload has attachments.
    Returns True if any part has a filename (indicating an attachment).
    """
    def check_parts(parts):
      if not parts:
        return False
      for part in parts:
        # If this part has a filename, it's an attachment
        if part.get('filename'):
          return True
        # Recursively check nested parts
        if part.get('parts') and check_parts(part.get('parts')):
          return True
      return False
    
    # Check if payload has parts
    if payload.get('parts'):
      return check_parts(payload.get('parts'))
    
    # Single part message - check if it has a filename
    return bool(payload.get('filename'))

  async def get_emails(self, user_id: str, mailbox_id: str, page_token: str = None, limit: int = 50, summarize: bool = False):
    """
    Lấy danh sách email từ Gmail dựa trên mailbox_id (nhãn).
    Hàm này tự động phân giải tên nhãn (ví dụ: 'todo') sang Gmail Label ID thực tế (ví dụ: 'Label_234').
    """
    service = await self.get_gmail_service(user_id)
    
    # 1. Map các nhãn hệ thống của Gmail (Frontend dùng số nhiều/chữ thường -> Gmail dùng ID chuẩn)
    system_labels_map = {
        'inbox': 'INBOX',
        'sent': 'SENT',
        'trash': 'TRASH',
        'drafts': 'DRAFT',  # Gmail dùng 'DRAFT' số ít
        'spam': 'SPAM',
        'starred': 'STARRED',
        'important': 'IMPORTANT'
    }

    # Lấy ID nếu là nhãn hệ thống
    gmail_label_id = system_labels_map.get(mailbox_id.lower())

    # 2. Nếu không phải nhãn hệ thống, tìm ID trong danh sách nhãn của người dùng
    if not gmail_label_id:
        try:
            # Lấy danh sách tất cả nhãn hiện có trên Gmail của user
            results = service.users().labels().list(userId='me').execute()
            labels = results.get('labels', [])
            
            # Chuẩn hóa tên cần tìm: 'todo' -> 'to do' để khớp với Gmail nếu user đặt tên có dấu cách
            search_name = mailbox_id.lower()
            if search_name == 'todo':
                search_name = 'to do'
            
            # Tìm nhãn có tên khớp
            for label in labels:
                if label['name'].lower() == search_name:
                    gmail_label_id = label['id']
                    break
            
            # Nếu vẫn không tìm thấy (nhãn chưa được tạo trên Gmail), trả về danh sách rỗng
            if not gmail_label_id:
                print(f"Label '{mailbox_id}' not found in Gmail account.")
                return {
                    "threads": [],
                    "next_page_token": None,
                    "result_size_estimate": 0
                }
        except Exception as e:
            print(f"Error resolving label ID: {e}")
            return {"threads": [], "next_page_token": None, "result_size_estimate": 0}

    # 3. Gọi Gmail API để lấy danh sách tin nhắn với Label ID chính xác
    try:
        results = service.users().messages().list(
          userId='me',
          labelIds=[gmail_label_id],
          maxResults=limit,
          pageToken=page_token
        ).execute()
    except Exception as e:
        print(f"Error fetching messages from Gmail: {e}")
        # Trả về rỗng nếu lỗi API (ví dụ 404 Label not found dù đã cố tìm)
        return {"threads": [], "next_page_token": None, "result_size_estimate": 0}

    messages = results.get('messages', [])
    next_page_token = results.get('nextPageToken', None)
    result_size_estimate = results.get('resultSizeEstimate', 0)

    thread_list = []

    # 4. Lấy chi tiết từng tin nhắn
    for msg in messages:
      try:
          msg_data = service.users().messages().get(
            userId='me',
            id=msg['id'],
            format='full' # Need full format to get payload parts for attachment detection
          ).execute()

          payload = msg_data.get('payload', {})
          headers = payload.get('headers', [])

          # Hàm helper lấy header an toàn
          def get_header(name):
            return next((h['value'] for h in headers if h['name'].lower() == name.lower()), '')

          # Parse người gửi
          from_header = get_header('From')
          if from_header:
              name, email_addr = email.utils.parseaddr(from_header)
              sender_obj = {"name": name, "email": email_addr}
          else:
              sender_obj = {"name": "Unknown", "email": ""}

          # Parse người nhận (To)
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

          # Check if message has attachments
          has_attachments = self._has_attachments(payload)

          # Mapping dữ liệu trả về cho Frontend
          thread_list.append({
            "id": msg['id'],
            "history_id": msg_data.get('historyId'),
            "subject": subject,
            "sender": sender_obj,
            "to": to_list,
            "received_on": received_on,
            "unread": "UNREAD" in msg_data.get('labelIds', []),
            # Trả về danh sách tags/labels để frontend hiển thị (nếu cần)
            "tags": [{"id": l, "name": l} for l in msg_data.get('labelIds', [])],
            "body": preview_body, # Snippet là bản tóm tắt ngắn của body
            "summary": summary_text,
            "has_attachments": has_attachments
          })
      except Exception as e:
          # Log lỗi nhưng không làm chết cả danh sách nếu 1 email lỗi
          print(f"Error processing message {msg.get('id')}: {e}")
          continue

    return {
      "threads": thread_list,
      "next_page_token": next_page_token,
      "result_size_estimate": result_size_estimate
    }

  async def get_email_detail(self, user_id: str, email_id: str, summarize: bool = False) -> ThreadDetailResponse:
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
        if summarize:
            try:
                parsed["summary"] = await self._get_summarizer().summarize(parsed.get("body", ""))
            except Exception as e:
                logger.warning(f"Summarize detail failed for {msg.get('id')}: {e}")
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

      processed_html = body_html or f"<pre>{body_text}</pre>"
      
      # Log email HTML content for debugging
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
          "body": body_text or body_html, # Fallback
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

  # [CẬP NHẬT] Sửa lại hàm modify_email
  async def modify_email(self, user_id: str, email_id: str, updates: dict):
      service = await self.get_gmail_service(user_id)
      
      print(f"[MODIFY EMAIL] user_id={user_id}, email_id={email_id}, updates={updates}")

      add_label_ids = []
      remove_label_ids = []

      # Xử lý unread
      if 'unread' in updates:
          if updates['unread']:
              add_label_ids.append('UNREAD')
              if 'UNREAD' in remove_label_ids: remove_label_ids.remove('UNREAD')
          else:
              remove_label_ids.append('UNREAD')
              if 'UNREAD' in add_label_ids: add_label_ids.remove('UNREAD')

      # Xử lý starred
      if 'starred' in updates:
          if updates['starred']:
              add_label_ids.append('STARRED')
              if 'STARRED' in remove_label_ids: remove_label_ids.remove('STARRED')
          else:
              remove_label_ids.append('STARRED')
              if 'STARRED' in add_label_ids: add_label_ids.remove('STARRED')

      # Xử lý trash
      if updates.get('trash'):
           add_label_ids.append('TRASH')
           # Gmail tự động xóa các nhãn khác khi vào Trash, nhưng ta cứ thêm vào list xóa cho chắc
           if 'TRASH' in remove_label_ids: remove_label_ids.remove('TRASH')

      # [LOGIC MỚI] Xử lý custom labels (Todo, Done...)
      if 'labels' in updates:
          labels_to_add = updates.get('labels', [])
          
          # Khi di chuyển email giữa các cột Kanban, cần xóa TẤT CẢ các label Kanban khác
          # để email chỉ xuất hiện ở 1 cột
          
          for label_name in labels_to_add:
              # Lấy ID thật của nhãn (ví dụ: "todo" -> "Label_123")
              real_label_id = await self._get_or_create_label_id(service, user_id, label_name)
              
              if real_label_id not in add_label_ids:
                  add_label_ids.append(real_label_id)
          
          # Lấy danh sách tất cả label hiện tại của email để xóa các label Kanban khác
          try:
              msg = service.users().messages().get(userId='me', id=email_id, format='minimal').execute()
              current_label_ids = msg.get('labelIds', [])
              
              # Lấy danh sách tất cả labels của user để map ID -> name
              all_labels_result = service.users().labels().list(userId='me').execute()
              all_labels = all_labels_result.get('labels', [])
              label_id_to_name = {label['id']: label['name'] for label in all_labels}
              
              # Xác định các label là "Kanban column labels" (user labels và INBOX, STARRED, SNOOZED)
              # System labels để giữ lại: SENT, DRAFT, TRASH, SPAM, IMPORTANT, UNREAD
              system_labels_to_keep = ['SENT', 'DRAFT', 'SPAM', 'IMPORTANT', 'UNREAD', 'CATEGORY_*']
              
              for label_id in current_label_ids:
                  label_name = label_id_to_name.get(label_id, label_id)
                  
                  # Bỏ qua nếu là label mới đang được thêm
                  if label_id in add_label_ids:
                      continue
                  
                  # Bỏ qua các system labels cần giữ
                  if label_id in system_labels_to_keep or label_id.startswith('CATEGORY_'):
                      continue
                  
                  # Xóa các label có thể là Kanban columns:
                  # - INBOX, STARRED, SNOOZED (system labels thường dùng cho Kanban)
                  # - Tất cả user labels (type='user')
                  label_info = next((l for l in all_labels if l['id'] == label_id), None)
                  if label_info:
                      label_type = label_info.get('type', 'user')
                      if label_id in ['INBOX', 'STARRED', 'SNOOZED'] or label_type == 'user':
                          if label_id not in remove_label_ids:
                              remove_label_ids.append(label_id)
                              print(f"[KANBAN] Removing label '{label_name}' ({label_id}) to move email to new column")
          
          except Exception as e:
              print(f"Warning: Could not remove old Kanban labels: {e}")
              # Fallback to old behavior if error occurs
              pass

      # Safety check: Ensure email has at least one label
      # If we're removing all labels, keep the email in a safe place
      if remove_label_ids and not add_label_ids:
          print("[WARNING] No labels would be added! Keeping INBOX to prevent email from being 'lost'")
          remove_label_ids = [lid for lid in remove_label_ids if lid != 'INBOX']
          if 'INBOX' not in add_label_ids:
              add_label_ids.append('INBOX')

      body = {
          'addLabelIds': add_label_ids,
          'removeLabelIds': remove_label_ids
      }
      
      print(f"[MODIFY EMAIL] Sending to Gmail API - add: {add_label_ids}, remove: {remove_label_ids}")

      try:
          service.users().messages().modify(userId='me', id=email_id, body=body).execute()
      except Exception as e:
          print(f"Gmail API Error: {e}")
          raise ValueError(f"Failed to modify email labels: {str(e)}")

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

  async def summarize_email(self, user_id: str, email_id: str) -> dict:
      """Summarize a single email's latest message."""
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

# [THÊM MỚI] Hàm hỗ trợ tìm hoặc tạo Label ID từ tên
  async def _get_or_create_label_id(self, service, user_id: str, label_name: str) -> str:
      # Map các tên cột Kanban sang tên hiển thị trên Gmail
      SYSTEM_LABELS = {'INBOX': 'INBOX', 'TRASH': 'TRASH', 'SPAM': 'SPAM', 'UNREAD': 'UNREAD', 'STARRED': 'STARRED', 'SNOOZED': 'SNOOZED'}
      label_upper = label_name.upper()
      
      # Nếu là nhãn hệ thống, trả về ngay
      if label_upper in SYSTEM_LABELS:
          return SYSTEM_LABELS[label_upper]

      # Sử dụng tên gốc mà user nhập (không convert thành Title Case)
      # Nếu user muốn "todo" thì để "todo", không chuyển thành "Todo"
      display_name = label_name.strip()
      
      # Chỉ xử lý đặc biệt cho một số tên phổ biến
      special_cases = {
          'todo': 'To Do',
          'done': 'Done',
      }
      if label_name.lower() in special_cases:
          display_name = special_cases[label_name.lower()]
      
      try:
          # 1. Lấy danh sách tất cả nhãn hiện có
          results = service.users().labels().list(userId='me').execute()
          labels = results.get('labels', [])
          
          # 2. Tìm xem nhãn đã tồn tại chưa (so sánh không phân biệt hoa thường)
          for label in labels:
              if label['name'].lower() == display_name.lower():
                  print(f"Found existing label: {label['name']} (id: {label['id']})")
                  return label['id'] # Trả về Label ID thật (vd: Label_34234)

          # 3. Nếu chưa có, tạo mới nhãn trên Gmail
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
          # Fallback: Trả về nguyên gốc nếu lỗi (có thể gây lỗi 400 nhưng tốt hơn là crash)
          return label_name

  async def snooze_email(self, user_id: str, email_id: str, snooze_until: datetime):
        service = await self.get_gmail_service(user_id)

        # Normalize snooze time to UTC
        snooze_until_utc = (
            snooze_until.replace(tzinfo=timezone.utc)
            if snooze_until.tzinfo is None
            else snooze_until.astimezone(timezone.utc)
        )

        # Fetch current labels to restore later
        try:
            msg_metadata = service.users().messages().get(
                userId='me', id=email_id, format='minimal'
            ).execute()
            current_labels = msg_metadata.get('labelIds', [])
        except Exception as e:
            raise ValueError(f"Failed to read current labels before snooze: {e}")

        # 1. Create SNOOZED label on Gmail if it does not exist
        snooze_label_id = await self._get_or_create_label_id(service, user_id, "SNOOZED")

        # 2. Remove from INBOX, add to SNOOZED
        body = {
            'addLabelIds': [snooze_label_id],
            'removeLabelIds': ['INBOX']
        }
        try:
            service.users().messages().modify(userId='me', id=email_id, body=body).execute()
        except Exception as e:
            raise ValueError(f"Gmail API Error: {e}")

        # 3. Save to MongoDB for worker to monitor (track original labels)
        now_utc = datetime.utcnow().replace(tzinfo=timezone.utc)
        await self.snoozed_collection.update_one(
            {"email_id": email_id, "user_id": user_id},
            {
                "$set": {
                    "user_id": user_id,
                    "email_id": email_id,
                    "snooze_until": snooze_until_utc,
                    "status": "active",
                    "original_labels": current_labels,
                    "updated_at": now_utc,
                },
                "$setOnInsert": {"created_at": now_utc},
            },
            upsert=True
        )

        return {"message": f"Email snoozed until {snooze_until_utc.isoformat()}"}

    # Function called by Scheduler
  async def check_and_restore_snoozed_emails(self):
        now_utc = datetime.utcnow().replace(tzinfo=timezone.utc)
        # Find emails whose snooze has expired and are still active
        cursor = self.snoozed_collection.find({
            "snooze_until": {"$lte": now_utc},
            "status": "active"
        })

        async for record in cursor:
            user_id = record["user_id"]
            email_id = record["email_id"]
            original_labels = record.get("original_labels") or ["INBOX"]

            # Remove SNOOZED from the labels we will add back
            labels_to_restore = [
                label for label in original_labels if label != "SNOOZED"
            ]

            try:
                print(f"[SNOOZE WORKER] Restoring email {email_id} for user {user_id}")
                service = await self.get_gmail_service(user_id)

                snooze_label_id = await self._get_or_create_label_id(service, user_id, "SNOOZED")

                body = {
                    'addLabelIds': labels_to_restore,
                    'removeLabelIds': [snooze_label_id]
                }
                service.users().messages().modify(userId='me', id=email_id, body=body).execute()

                await self.snoozed_collection.update_one(
                    {"_id": record["_id"]},
                    {"$set": {
                        "status": "processed",
                        "restored_at": now_utc,
                        "updated_at": now_utc,
                        "last_error": None
                    }}
                )
            except Exception as e:
                await self.snoozed_collection.update_one(
                    {"_id": record["_id"]},
                    {"$set": {
                        "status": "error",
                        "last_error": str(e),
                        "updated_at": now_utc
                    }}
                )
                print(f"[SNOOZE WORKER] Error restoring email {email_id}: {e}")