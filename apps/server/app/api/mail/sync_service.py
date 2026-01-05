"""
Email synchronization service.

Handles all email sync operations including:
- Smart sync prioritizing recent emails
- Incremental sync from Gmail history
- Full sync operations
- Sync state management
"""

import logging
import email.utils
import base64
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Set, List
from pymongo.asynchronous.database import AsyncDatabase
from bson import ObjectId

from app.api.mail.models import EmailDocument, Attachment
from app.config import settings


logger = logging.getLogger(__name__)


class EmailSyncService:
    """Service for handling email synchronization operations."""

    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.emails_collection = db["emails"]
        self.email_index_collection = db["email_index"]
        self.sync_state_collection = db["mail_sync_state"]
        self.users_collection = db["users"]

    async def get_gmail_service(self, user_id: str):
        """Get Gmail service for a user."""
        from app.utils.security import decrypt_token
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

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

    async def _resolve_label_id(self, service, user_id: str, mailbox_id: Optional[str]) -> Optional[str]:
        """Resolve mailbox ID to Gmail label ID."""
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
            logger.warning(f"Error resolving label {mailbox_id}: {e}")
            gmail_label_id = None

        return gmail_label_id

    def _parse_message_for_index(self, msg_data: dict, user_id: str) -> dict:
        """Parse message for search indexing (legacy format)."""
        payload = msg_data.get('payload', {})
        headers = payload.get('headers', [])
        def get_header(name: str) -> str:
            return next((h['value'] for h in headers if h['name'].lower() == name.lower()), '')
        subject = get_header('Subject') or '(No Subject)'
        from_header = get_header('From')

        # Parse From header safely
        try:
            parse_result = email.utils.parseaddr(from_header)
            if len(parse_result) == 2:
                name, email_addr = parse_result
            else:
                logger.warning(f"[INDEX PARSE] parseaddr returned {len(parse_result)} items for From header: {parse_result}")
                name, email_addr = "", from_header
        except Exception as e:
            logger.warning(f"[INDEX PARSE] Error parsing From header '{from_header[:100]}...': {e}")
            name, email_addr = "", from_header

        internal_date = msg_data.get('internalDate')
        received_on = ""
        if internal_date:
            try:
                timestamp = int(internal_date) / 1000
                received_on = datetime.fromtimestamp(timestamp).isoformat()
            except (ValueError, TypeError) as e:
                logger.warning(f"[INDEX PARSE] Error parsing internalDate '{internal_date}': {e}")
                received_on = datetime.utcnow().isoformat()  # fallback
        else:
            logger.debug(f"[INDEX PARSE] No internalDate found for message {msg_data.get('id', 'unknown')}")
        label_ids = msg_data.get('labelIds', [])
        snippet = msg_data.get('snippet', '') or ''
        to_header = get_header('To')
        to_list = []
        if to_header:
            try:
                addresses = email.utils.getaddresses([to_header])
                to_list = [{"name": n, "email": e} for n, e in addresses]
            except Exception as e:
                logger.warning(f"[INDEX PARSE] Error parsing To header '{to_header[:100]}...': {e}")
                to_list = []
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
            "unread": "UNREAD" in label_ids,
            "is_embedded": False
        }

    def _parse_message_for_storage(self, msg_data: dict, user_id: str) -> EmailDocument:
        """Parse Gmail message data into EmailDocument for full storage."""
        import base64
        from app.api.mail.models import Sender

        msg_id = msg_data.get('id', 'unknown')
        logger.debug(f"[PARSE] Starting to parse message {msg_id}")

        # Parse message data directly
        payload = msg_data.get('payload', {})
        headers = payload.get('headers', [])

        logger.debug(f"[PARSE] Message {msg_id} has {len(headers)} headers, payload keys: {list(payload.keys())}")

        # Debug: log From header early to catch parsing issues
        from_header_raw = None
        for h in headers:
            if h.get('name', '').lower() == 'from':
                from_header_raw = h.get('value', '')
                logger.debug(f"[PARSE] Raw From header for {msg_id}: '{from_header_raw[:200]}...'")
                break

        def get_header(name: str) -> str:
            for h in headers:
                if h.get('name', '').lower() == name.lower():
                    return h.get('value', '')
            return ''

        def get_header_list(name: str) -> List[Sender]:
            val = get_header(name)
            if not val:
                return []
            try:
                logger.debug(f"[PARSE] Parsing {name} header: '{val[:100]}...'")
                addresses = email.utils.getaddresses([val])
                logger.debug(f"[PARSE] Parsed {len(addresses)} addresses for {name}: {addresses}")

                result = []
                for addr_tuple in addresses:
                    if len(addr_tuple) == 2:
                        n, e = addr_tuple
                        result.append({"name": n, "email": e})
                    else:
                        logger.warning(f"[PARSE] Unexpected address format in {name}: {addr_tuple} (expected 2 items, got {len(addr_tuple)})")
                        # Try to handle malformed addresses
                        if len(addr_tuple) > 0:
                            result.append({"name": "", "email": str(addr_tuple[0])})
                return result
            except Exception as e:
                logger.warning(f"[PARSE] Error parsing email addresses for {name}: {e}, raw value: '{val}'")
                return []

        # Basic fields
        subject = get_header('Subject') or '(No Subject)'

        from_header = get_header('From')
        logger.debug(f"[PARSE] From header for {msg_id}: '{from_header}'")
        try:
            parse_result = email.utils.parseaddr(from_header)
            logger.debug(f"[PARSE] parseaddr result: {parse_result}")
            if len(parse_result) == 2:
                from_name, from_email = parse_result
            else:
                logger.warning(f"[PARSE] parseaddr returned {len(parse_result)} items instead of 2 for From header: {parse_result}")
                from_name, from_email = "", from_header  # fallback
        except Exception as e:
            logger.warning(f"[PARSE] Error parsing From header '{from_header}': {e}")
            from_name, from_email = "", from_header  # fallback

        to_list = get_header_list('To')
        cc_list = get_header_list('Cc')
        bcc_list = get_header_list('Bcc')

        internal_date = msg_data.get('internalDate')
        received_on = ""
        if internal_date:
            try:
                timestamp = int(internal_date) / 1000
                received_on = datetime.fromtimestamp(timestamp).isoformat()
                logger.debug(f"[PARSE] Parsed timestamp {internal_date} -> {received_on}")
            except (ValueError, TypeError) as e:
                logger.warning(f"[PARSE] Error parsing internalDate '{internal_date}': {e}")
                received_on = datetime.utcnow().isoformat()  # fallback to current time
        else:
            logger.debug(f"[PARSE] No internalDate found for message {msg_id}")

        label_ids = msg_data.get('labelIds', [])
        tags = [{"id": l, "name": l} for l in label_ids]

        # Parse body content
        body_text = ""
        body_html = ""
        attachments = []

        logger.debug(f"[PARSE] Message {msg_id} has {'parts' if 'parts' in payload else 'no parts'}")

        def parse_parts(parts, depth=0):
            nonlocal body_text, body_html
            indent = "  " * depth
            logger.debug(f"[PARSE] {indent}Parsing {len(parts)} parts at depth {depth}")

            for i, part in enumerate(parts):
                mime_type = part.get('mimeType')
                body = part.get('body', {})
                data = body.get('data')
                filename = part.get('filename')

                logger.debug(f"[PARSE] {indent}Part {i}: mime={mime_type}, filename={filename}, has_data={bool(data)}")

                if filename:
                    logger.debug(f"[PARSE] {indent}Found attachment: {filename}")
                    attachments.append({
                        "attachment_id": body.get('attachmentId'),
                        "message_id": msg_data['id'],
                        "filename": filename,
                        "mime_type": mime_type,
                        "size": body.get('size', 0),
                        "body": "",
                        "headers": []
                    })

                try:
                    if mime_type == 'text/plain' and data:
                        decoded = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                        body_text += decoded
                        logger.debug(f"[PARSE] {indent}Added {len(decoded)} chars to body_text")
                    elif mime_type == 'text/html' and data:
                        decoded = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                        body_html += decoded
                        logger.debug(f"[PARSE] {indent}Added {len(decoded)} chars to body_html")
                    elif part.get('parts'):
                        parse_parts(part.get('parts'), depth + 1)
                except Exception as e:
                    logger.warning(f"[PARSE] Error decoding part {i} in message {msg_id}: {e}")

        try:
            if 'parts' in payload:
                parse_parts(payload['parts'])
            else:
                data = payload.get('body', {}).get('data')
                mime_type = payload.get('mimeType')
                logger.debug(f"[PARSE] Simple message, mime={mime_type}, has_data={bool(data)}")
                if data:
                    decoded = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                    if mime_type == 'text/html':
                        body_html = decoded
                        logger.debug(f"[PARSE] Set body_html with {len(decoded)} chars")
                    else:
                        body_text = decoded
                        logger.debug(f"[PARSE] Set body_text with {len(decoded)} chars")
        except Exception as e:
            logger.warning(f"[PARSE] Error parsing body content for message {msg_id}: {e}")

        logger.debug(f"[PARSE] Message {msg_id} parsed: text={len(body_text)} chars, html={len(body_html)} chars, attachments={len(attachments)}")

        processed_html = body_html or f"<pre>{body_text}</pre>"

        # Convert attachments to Attachment objects
        attachments_metadata = []
        logger.debug(f"[PARSE] Creating attachment objects for {len(attachments)} attachments")
        for i, att in enumerate(attachments):
            try:
                attachment_obj = Attachment(
                    attachment_id=att.get('attachment_id'),
                    message_id=att.get('message_id'),
                    filename=att.get('filename'),
                    mime_type=att.get('mime_type'),
                    size=att.get('size', 0),
                    body="",  # Don't store binary content
                    headers=[]  # Don't store headers for storage
                )
                attachments_metadata.append(attachment_obj)
                logger.debug(f"[PARSE] Created attachment {i+1}: {att.get('filename')} ({att.get('size', 0)} bytes)")
            except Exception as e:
                logger.warning(f"[PARSE] Error creating attachment object {i+1} for message {msg_id}: {e}")
                continue

        # Create EmailDocument
        now = datetime.utcnow().isoformat()
        logger.debug(f"[PARSE] Creating EmailDocument for message {msg_id}")

        try:
            email_doc = EmailDocument(
                user_id=user_id,
                message_id=msg_data.get('id'),
                thread_id=msg_data.get('threadId'),
                history_id=msg_data.get('historyId'),
                subject=subject,
                from_name=from_name,
                from_email=from_email,
                to=to_list,
                cc=cc_list,
                bcc=bcc_list,
                received_on=received_on,
                created_at=now,
                updated_at=now,
                body=body_text or body_html,
                processed_html=processed_html,
                decoded_body=body_text,
                snippet=msg_data.get('snippet', ''),
                labels=label_ids,
                tags=tags,
                unread="UNREAD" in label_ids,
                has_attachments=len(attachments_metadata) > 0,
                attachments=attachments_metadata if attachments_metadata else None,
                message_id_header=get_header('Message-ID'),
                references=get_header('References'),
                in_reply_to=get_header('In-Reply-To'),
                is_embedded=False
            )

            logger.debug(f"[PARSE] Successfully created EmailDocument for message {msg_id}: subject='{subject[:50]}...', labels={len(label_ids)}, attachments={len(attachments_metadata)}")
            return email_doc

        except Exception as e:
            logger.error(f"[PARSE] Error creating EmailDocument for message {msg_id}: {e}")
            logger.debug(f"[PARSE] Message data keys: {list(msg_data.keys())}")
            logger.debug(f"[PARSE] Parsed data: subject='{subject}', from='{from_name} <{from_email}>', labels={label_ids}")
            raise

    async def _upsert_index_doc(self, doc: dict):
        """Upsert search index document."""
        now = datetime.utcnow().isoformat()

        # Remove timestamp fields from doc to avoid conflicts
        doc_for_set = {k: v for k, v in doc.items() if k not in ['created_at', 'updated_at']}

        await self.email_index_collection.update_one(
            {"user_id": doc["user_id"], "message_id": doc["message_id"]},
            {
                "$set": {
                    **doc_for_set,           # All document fields
                    "updated_at": now        # Always update timestamp
                },
                "$setOnInsert": {"created_at": now}  # Only on insert
            },
            upsert=True
        )

    async def _check_existing_message_ids(self, user_id: str, message_ids: List[str]) -> Set[str]:
        """Batch check which message_ids already exist in DB for a user."""
        if not message_ids:
            return set()

        # Query for existing message_ids in both collections
        existing_emails = await self.emails_collection.find(
            {"user_id": user_id, "message_id": {"$in": message_ids}},
            {"message_id": 1}
        ).to_list(length=None)

        existing_indices = await self.email_index_collection.find(
            {"user_id": user_id, "message_id": {"$in": message_ids}},
            {"message_id": 1}
        ).to_list(length=None)

        # Combine results
        existing_ids = set()
        for doc in existing_emails + existing_indices:
            existing_ids.add(doc["message_id"])

        return existing_ids

    async def _upsert_email_doc(self, email_doc: EmailDocument):
        """Upsert full email document."""
        now = datetime.utcnow().isoformat()

        # Convert to dict for MongoDB storage
        doc_dict = email_doc.model_dump()

        # Remove timestamp fields from doc to avoid conflicts
        doc_for_set = {k: v for k, v in doc_dict.items() if k not in ['created_at', 'updated_at']}

        # Preserve kanban labels (user labels) when syncing from Gmail
        existing_doc = await self.emails_collection.find_one(
            {"user_id": email_doc.user_id, "message_id": email_doc.message_id}
        )

        if existing_doc:
            # Get all user labels (kanban labels) from DB
            user_labels = await self.labels_collection.find(
                {"user_id": email_doc.user_id}
            ).to_list(length=None)
            user_label_ids = [label['label_id'] for label in user_labels]

            # Preserve existing kanban labels that are not in Gmail data
            existing_labels = existing_doc.get('labels', [])
            gmail_labels = doc_for_set.get('labels', [])

            # Keep kanban labels that exist in DB but not in Gmail sync
            preserved_labels = []
            for label_id in existing_labels:
                if label_id in user_label_ids and label_id not in gmail_labels:
                    preserved_labels.append(label_id)

            # Merge Gmail labels with preserved kanban labels
            if preserved_labels:
                doc_for_set['labels'] = gmail_labels + preserved_labels
                logger.debug(f"[SYNC] Preserved kanban labels for {email_doc.message_id}: {preserved_labels}")

        await self.emails_collection.update_one(
            {"user_id": email_doc.user_id, "message_id": email_doc.message_id},
            {
                "$set": {
                    **doc_for_set,           # All email data fields
                    "updated_at": now        # Always update timestamp
                },
                "$setOnInsert": {"created_at": now}  # Only on insert
            },
            upsert=True
        )

    async def _sync_from_history(self, service, user_id: str, start_history_id: str, mailbox_label_id: Optional[str], max_pages: int = 3) -> Optional[str]:
        """Sync emails from Gmail history API."""
        page_token = None
        latest_history_id = start_history_id
        processed: Set[str] = set()
        pages = 0
        while pages < max_pages:
            history_request = service.users().history().list(
                userId='me',
                startHistoryId=start_history_id,
                labelId=mailbox_label_id,
                historyTypes=['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
                pageToken=page_token,
                maxResults=200
            )
            history_response = history_request.execute()
            histories = history_response.get('history', [])
            for record in histories:
                latest_history_id = record.get('id', latest_history_id)
                for msg_entry in record.get('messages', []):
                    msg_id = msg_entry.get('id')
                    if not msg_id or msg_id in processed:
                        continue
                    processed.add(msg_id)
                    try:
                        msg_data = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
                        doc = self._parse_message_for_index(msg_data, user_id)
                        await self._upsert_index_doc(doc)
                        # Also store full email document
                        full_doc = self._parse_message_for_storage(msg_data, user_id)
                        await self._upsert_email_doc(full_doc)
                    except Exception:
                        continue
                for added in record.get('messagesAdded', []):
                    msg_obj = added.get('message', {})
                    msg_id = msg_obj.get('id')
                    if not msg_id or msg_id in processed:
                        continue
                    processed.add(msg_id)
                    try:
                        msg_data = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
                        doc = self._parse_message_for_index(msg_data, user_id)
                        await self._upsert_index_doc(doc)
                        # Also store full email document
                        full_doc = self._parse_message_for_storage(msg_data, user_id)
                        await self._upsert_email_doc(full_doc)
                    except Exception:
                        continue
            page_token = history_response.get('nextPageToken')
            pages += 1
            if not page_token:
                break
        return latest_history_id

    async def _smart_sync_recent_first(self, service, user_id: str, mailbox_label_id: Optional[str], max_emails: int = 1000) -> Dict[str, Any]:
        """
        Sync emails prioritizing newest first, with a maximum limit.
        This is more efficient than full_resync for initial loads and ongoing syncs.

        Returns:
            Dict with 'history_id' and optional 'backlog_cursor' for remaining pages
        """
        latest_history_id = None
        synced_count = 0
        error_count = 0

        # First, try to get recent emails (no date filter for most recent)
        page_token = None
        pages = 0
        max_pages = min(50, max(5, (max_emails // 100) + 1))  # Ensure at least 5 pages to detect backlog

        logger.info(f"[SMART SYNC] Starting sync for user {user_id}, max_emails={max_emails}, mailbox={mailbox_label_id}")

        while pages < max_pages and synced_count < max_emails:
            try:
                # Get most recent emails first (no 'after' filter = newest)
                logger.debug(f"[SMART SYNC] Listing messages page {pages + 1}, page_token={page_token[:20] if page_token else None}")
                results = service.users().messages().list(
                    userId='me',
                    labelIds=[mailbox_label_id] if mailbox_label_id else None,
                    maxResults=min(100, max_emails - synced_count),  # Don't exceed our limit
                    pageToken=page_token
                ).execute()
            except Exception as e:
                logger.error(f"[SMART SYNC] Error listing messages on page {pages + 1}: {e}")
                break

            messages = results.get('messages', [])
            if not messages:
                logger.info(f"[SMART SYNC] No more messages on page {pages + 1}")
                break

            logger.info(f"[SMART SYNC] Processing page {pages + 1}, {len(messages)} messages")

            # Extract message IDs from this page
            page_message_ids = [msg.get('id') for msg in messages if msg.get('id')]
            if not page_message_ids:
                logger.warning(f"[SMART SYNC] No valid message IDs in page {pages + 1}")
                page_token = results.get('nextPageToken')
                pages += 1
                continue

            # Check which messages already exist in DB
            existing_message_ids = await self._check_existing_message_ids(user_id, page_message_ids)
            messages_to_sync = [msg for msg in messages if msg.get('id') not in existing_message_ids]

            logger.info(f"[SMART SYNC] Page {pages + 1}: {len(messages)} total, {len(existing_message_ids)} already exist, {len(messages_to_sync)} to sync")

            if not messages_to_sync:
                logger.info(f"[SMART SYNC] All messages in page {pages + 1} already exist, skipping to next page")
                page_token = results.get('nextPageToken')
                pages += 1
                continue

            # Process messages that don't exist in DB
            for i, msg in enumerate(messages_to_sync):
                if synced_count >= max_emails:
                    logger.info(f"[SMART SYNC] Reached max_emails limit ({max_emails})")
                    break

                msg_id = msg.get('id')
                logger.debug(f"[SMART SYNC] Processing message {i+1}/{len(messages_to_sync)}: {msg_id}")

                try:
                    msg_data = service.users().messages().get(
                        userId='me',
                        id=msg_id,
                        format='full'
                    ).execute()

                    latest_history_id = msg_data.get('historyId') or latest_history_id

                    # Log basic message info
                    subject = "Unknown"
                    try:
                        payload = msg_data.get('payload', {})
                        headers = payload.get('headers', [])
                        subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), 'No Subject')
                    except Exception as e:
                        logger.warning(f"[SMART SYNC] Error extracting subject for {msg_id}: {e}")

                    logger.debug(f"[SMART SYNC] Message {msg_id}: '{subject[:50]}...'")

                    # Store in search index first (this usually works)
                    try:
                        doc = self._parse_message_for_index(msg_data, user_id)
                        await self._upsert_index_doc(doc)
                        logger.debug(f"[SMART SYNC] Indexed message {msg_id} for search")
                    except Exception as e:
                        logger.warning(f"[SMART SYNC] Error indexing message {msg_id}: {e}")

                    # Try to store full document (this is where parsing errors occur)
                    try:
                        full_doc = self._parse_message_for_storage(msg_data, user_id)
                        await self._upsert_email_doc(full_doc)
                        synced_count += 1
                        logger.debug(f"[SMART SYNC] Successfully processed message {msg_id} ({synced_count}/{max_emails})")
                    except Exception as e:
                        error_count += 1
                        logger.warning(f"[SMART SYNC] Error storing full message {msg_id} (error {error_count}): {e}")
                        logger.debug(f"[SMART SYNC] Message data keys for {msg_id}: {list(msg_data.keys())}")
                        # Try to log some basic info about the problematic message
                        try:
                            payload = msg_data.get('payload', {})
                            headers = payload.get('headers', [])
                            from_header = next((h['value'] for h in headers if h['name'].lower() == 'from'), 'Unknown')
                            logger.debug(f"[SMART SYNC] Problematic message {msg_id} - From: '{from_header[:100]}', Headers count: {len(headers)}")
                        except Exception as log_e:
                            logger.debug(f"[SMART SYNC] Could not log message info for {msg_id}: {log_e}")
                        continue

                except Exception as e:
                    error_count += 1
                    logger.warning(f"[SMART SYNC] Error fetching message {msg_id} (error {error_count}): {e}")
                    continue

            page_token = results.get('nextPageToken')
            pages += 1

            if not page_token:
                logger.info(f"[SMART SYNC] No more pages after page {pages}")
                break

        logger.info(f"[SMART SYNC] Completed sync for user {user_id}: {synced_count} emails synced, {error_count} errors")

        result = {"history_id": latest_history_id}

        # Check if there are remaining pages for backlog processing
        if page_token:
            # There are more pages available beyond our processing limit
            result["backlog_cursor"] = page_token
            result["backlog_mode"] = "pages"
            logger.info(f"[SMART SYNC] Backlog cursor saved: {page_token[:50]}... (remaining pages to process)")

        return result

    async def _full_resync(self, service, user_id: str, mailbox_label_id: Optional[str], lookback_days: int = 90, max_pages: int = 5) -> Optional[str]:
        """Legacy full resync - kept for backward compatibility."""
        cutoff = datetime.utcnow() - timedelta(days=lookback_days)
        query_parts = [f"after:{int(cutoff.timestamp())}"]
        page_token = None
        pages = 0
        latest_history_id = None
        synced_count = 0
        error_count = 0
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
            for msg in messages:
                try:
                    msg_data = service.users().messages().get(
                        userId='me',
                        id=msg['id'],
                        format='full'
                    ).execute()
                    latest_history_id = msg_data.get('historyId') or latest_history_id
                    doc = self._parse_message_for_index(msg_data, user_id)
                    await self._upsert_index_doc(doc)
                    # Also store full email document
                    full_doc = self._parse_message_for_storage(msg_data, user_id)
                    await self._upsert_email_doc(full_doc)
                    synced_count += 1
                except Exception:
                    error_count += 1
                    continue
            page_token = results.get('nextPageToken')
            pages += 1
            if not page_token:
                break

        logger.info(f"[SMART SYNC] Completed sync for user {user_id}: {synced_count} emails synced, {error_count} errors")
        return {"history_id": latest_history_id}

    async def sync_email_index(self, user_id: str, mailbox_id: Optional[str] = None, max_emails: Optional[int] = None) -> Dict[str, Any]:
        """Smart sync that prioritizes recent emails and supports incremental updates."""
        logger.info(f"[SYNC] Starting sync for user {user_id}, mailbox={mailbox_id}")

        if max_emails is None:
            max_emails = settings.MAIL_SYNC_MAX_EMAILS_PER_BATCH
            logger.debug(f"[SYNC] Using default max_emails={max_emails}")

        try:
            service = await self.get_gmail_service(user_id)
            logger.debug(f"[SYNC] Got Gmail service for user {user_id}")
        except Exception as e:
            logger.error(f"[SYNC] Failed to get Gmail service for user {user_id}: {e}")
            return {"synced": False, "error": "Failed to authenticate with Gmail"}

        try:
            mailbox_label_id = await self._resolve_label_id(service, user_id, mailbox_id)
            logger.debug(f"[SYNC] Resolved mailbox {mailbox_id} to label {mailbox_label_id}")
        except Exception as e:
            logger.error(f"[SYNC] Failed to resolve mailbox {mailbox_id}: {e}")
            return {"synced": False, "error": "Failed to resolve mailbox"}

        state = await self.sync_state_collection.find_one({"user_id": user_id})
        history_id = state.get("history_id") if state else None
        latest_history_id = None

        logger.debug(f"[SYNC] Current sync state: history_id={history_id[:20] if history_id else None}")

        # First try incremental sync from history (for new emails)
        if history_id:
            try:
                logger.info(f"[SYNC] Attempting incremental sync from history_id {history_id[:20]}...")
                latest_history_id = await self._sync_from_history(service, user_id, history_id, mailbox_label_id, max_pages=5)
                logger.info(f"[SYNC] Incremental sync completed, latest_history_id: {latest_history_id[:20] if latest_history_id else None}")
            except Exception as e:
                logger.warning(f"[SYNC] Incremental sync failed: {e}")
                latest_history_id = None

        # Always run smart sync to detect backlog (emails missed due to batch limits)
        logger.info(f"[SYNC] Performing smart sync to detect backlog with max_emails={max_emails}")
        try:
            smart_sync_result = await self._smart_sync_recent_first(service, user_id, mailbox_label_id, max_emails)

            # Update history_id if smart sync found a newer one
            if smart_sync_result.get("history_id") and (not latest_history_id or smart_sync_result["history_id"] > latest_history_id):
                latest_history_id = smart_sync_result["history_id"]

            # Check if backlog processing is needed
            backlog_cursor = smart_sync_result.get("backlog_cursor")
            if backlog_cursor:
                logger.info(f"[SYNC] Backlog cursor detected, will process remaining pages in background")

        except Exception as e:
            logger.error(f"[SYNC] Smart sync failed for user {user_id}: {e}")
            return {"synced": False, "error": "Sync process failed"}

        # Update sync state
        result = {"synced": False, "email_count": 0}
        try:
            now = datetime.utcnow().isoformat()
            update_data = {
                "user_id": user_id,
                "updated_at": now,
                "last_synced_at": now
            }

            # Only update history_id if we got a new one from incremental sync
            if latest_history_id:
                update_data["history_id"] = latest_history_id

            # Save backlog cursor if available (from smart sync)
            if 'backlog_cursor' in locals() and backlog_cursor:
                update_data["backlog_cursor"] = backlog_cursor
                update_data["backlog_mode"] = "pages"
                update_data["backlog_last_processed_at"] = now
                logger.debug(f"[SYNC] Saved backlog cursor for background processing: {backlog_cursor[:50]}...")

            # Mark full sync as completed if we've synced a reasonable amount
            current_email_count = await self.emails_collection.count_documents({"user_id": user_id})
            if current_email_count >= min(max_emails * 0.8, 100):  # Consider "full" if we have most of our target
                update_data["full_sync_completed"] = True
                update_data["sync_version"] = "2.0"  # New version with smart sync

            await self.sync_state_collection.update_one(
                {"user_id": user_id},
                {"$set": update_data},
                upsert=True
            )

            logger.info(f"[SYNC] Sync completed for user {user_id}: {current_email_count} total emails")
            result = {"synced": True, "email_count": current_email_count}

        except Exception as e:
            logger.error(f"[SYNC] Failed to update sync state for user {user_id}: {e}")
            result = {"synced": True, "email_count": 0, "warning": "Sync succeeded but state update failed"}

        return result

    async def sync_all_users(self, mailbox_id: Optional[str] = None):
        """Sync all users with Gmail tokens."""
        logger.info(f"[SYNC ALL] Starting sync for all users, mailbox={mailbox_id}")

        cursor = self.users_collection.find({"google_refresh_token": {"$exists": True}})
        user_count = 0
        success_count = 0
        error_count = 0

        async for user in cursor:
            user_id = str(user["_id"])
            user_count += 1

            logger.debug(f"[SYNC ALL] Processing user {user_count}: {user_id}")

            try:
                result = await self.sync_email_index(
                    user_id,
                    mailbox_id,
                    max_emails=settings.MAIL_SYNC_MAX_EMAILS_PER_BATCH
                )

                if result.get("synced", False):
                    success_count += 1
                    email_count = result.get("email_count", 0)
                    logger.info(f"[SYNC ALL] Successfully synced user {user_id}: {email_count} emails")
                else:
                    error_count += 1
                    error_msg = result.get("error", "Unknown error")
                    logger.warning(f"[SYNC ALL] Failed to sync user {user_id}: {error_msg}")

            except Exception as e:
                error_count += 1
                logger.warning(f"[SYNC ALL] Exception syncing user {user_id}: {e}")

        logger.info(f"[SYNC ALL] Completed sync for {user_count} users: {success_count} successful, {error_count} failed")

    async def _process_backlog(self, user_id: str, max_pages: int = None) -> Dict[str, Any]:
        """Process backlog of older emails that weren't synced due to batch limits.

        Args:
            user_id: User ID to process backlog for
            max_pages: Maximum pages to process in this run (defaults to config)

        Returns:
            Dict with processing results
        """
        if max_pages is None:
            max_pages = settings.MAIL_SYNC_BACKLOG_MAX_PAGES_PER_RUN

        logger.info(f"[BACKLOG] Starting backlog processing for user {user_id}, max_pages={max_pages}")

        try:
            service = await self.get_gmail_service(user_id)
        except Exception as e:
            logger.error(f"[BACKLOG] Failed to get Gmail service for user {user_id}: {e}")
            return {"processed": False, "error": "Failed to authenticate with Gmail"}

        # Get current sync state
        sync_state = await self.sync_state_collection.find_one({"user_id": user_id})

        if not sync_state or not sync_state.get("backlog_cursor"):
            logger.info(f"[BACKLOG] No backlog cursor found for user {user_id}, nothing to process")
            return {"processed": True, "message": "No backlog to process"}

        backlog_cursor = sync_state["backlog_cursor"]
        backlog_mode = sync_state.get("backlog_mode", "pages")

        logger.debug(f"[BACKLOG] Processing backlog with cursor: {backlog_cursor[:50]}..., mode: {backlog_mode}")

        processed_count = 0
        error_count = 0
        pages_processed = 0
        next_cursor = None

        try:
            # Process pages from backlog cursor
            page_token = backlog_cursor
            while pages_processed < max_pages and page_token:
                logger.debug(f"[BACKLOG] Processing page {pages_processed + 1}/{max_pages} with token: {page_token[:50]}...")

                try:
                    # List messages using the backlog cursor
                    results = service.users().messages().list(
                        userId='me',
                        pageToken=page_token,
                        maxResults=settings.MAIL_SYNC_BACKLOG_PAGE_SIZE
                    ).execute()
                except Exception as e:
                    logger.error(f"[BACKLOG] Error listing messages with page token {page_token[:50]}...: {e}")
                    error_count += 1
                    break

                messages = results.get('messages', [])
                next_page_token = results.get('nextPageToken')

                if not messages:
                    logger.info(f"[BACKLOG] No more messages in backlog for user {user_id}")
                    break

                # Extract message IDs and check which ones already exist
                page_message_ids = [msg.get('id') for msg in messages if msg.get('id')]
                if page_message_ids:
                    existing_message_ids = await self._check_existing_message_ids(user_id, page_message_ids)
                    messages_to_sync = [msg for msg in messages if msg.get('id') not in existing_message_ids]

                    logger.debug(f"[BACKLOG] Page has {len(messages)} messages, {len(existing_message_ids)} exist, {len(messages_to_sync)} to sync")

                    # Process messages that don't exist in DB
                    for msg in messages_to_sync:
                        msg_id = msg.get('id')
                        try:
                            msg_data = service.users().messages().get(
                                userId='me',
                                id=msg_id,
                                format='full'
                            ).execute()

                            # Store in search index first
                            doc = self._parse_message_for_index(msg_data, user_id)
                            await self._upsert_index_doc(doc)

                            # Store full document
                            full_doc = self._parse_message_for_storage(msg_data, user_id)
                            await self._upsert_email_doc(full_doc)

                            processed_count += 1
                            logger.debug(f"[BACKLOG] Processed message {msg_id} ({processed_count} total)")

                        except Exception as e:
                            error_count += 1
                            logger.warning(f"[BACKLOG] Error processing message {msg_id}: {e}")

                # Update cursor for next page
                page_token = next_page_token
                pages_processed += 1

                # Check if we've reached the limit for this run
                if processed_count >= settings.MAIL_SYNC_MAX_EMAILS_PER_BATCH:
                    logger.info(f"[BACKLOG] Reached max emails per batch limit ({settings.MAIL_SYNC_MAX_EMAILS_PER_BATCH})")
                    next_cursor = page_token
                    break

            # Update sync state
            now = datetime.utcnow().isoformat()
            update_data = {
                "backlog_last_processed_at": now
            }

            if next_cursor:
                # Still have more to process
                update_data["backlog_cursor"] = next_cursor
                logger.info(f"[BACKLOG] Backlog processing paused, cursor saved: {next_cursor[:50]}...")
            else:
                # Backlog processing completed
                update_data["backlog_cursor"] = None
                update_data["backlog_mode"] = None
                logger.info(f"[BACKLOG] Backlog processing completed for user {user_id}")

            await self.sync_state_collection.update_one(
                {"user_id": user_id},
                {"$set": update_data}
            )

            logger.info(f"[BACKLOG] Completed backlog processing for user {user_id}: {processed_count} emails processed, {error_count} errors, {pages_processed} pages")

            return {
                "processed": True,
                "emails_processed": processed_count,
                "errors": error_count,
                "pages_processed": pages_processed,
                "backlog_remaining": next_cursor is not None
            }

        except Exception as e:
            logger.error(f"[BACKLOG] Error during backlog processing for user {user_id}: {e}")
            return {"processed": False, "error": str(e)}

    async def run_backlog_loop(self):
        """Run the periodic backlog processing loop for all users."""
        import asyncio

        logger.info(f"[BACKLOG LOOP] Starting backlog processing loop with interval {settings.MAIL_SYNC_BACKLOG_INTERVAL_SECONDS} seconds")

        backlog_count = 0
        while True:
            backlog_count += 1
            start_time = datetime.utcnow()

            try:
                logger.debug(f"[BACKLOG LOOP] Starting backlog run #{backlog_count}")

                # Get all users with backlog cursors
                users_with_backlog = await self.sync_state_collection.find(
                    {"backlog_cursor": {"$ne": None}},
                    {"user_id": 1}
                ).to_list(length=None)

                processed_users = 0
                total_emails_processed = 0

                for user_doc in users_with_backlog:
                    user_id = user_doc["user_id"]
                    try:
                        result = await self._process_backlog(user_id)
                        if result.get("processed", False):
                            processed_users += 1
                            total_emails_processed += result.get("emails_processed", 0)
                    except Exception as e:
                        logger.warning(f"[BACKLOG LOOP] Error processing backlog for user {user_id}: {e}")

                if processed_users > 0:
                    logger.info(f"[BACKLOG LOOP] Run #{backlog_count} processed {processed_users} users, {total_emails_processed} emails")
                else:
                    logger.debug(f"[BACKLOG LOOP] Run #{backlog_count} found no users with backlog to process")

                duration = (datetime.utcnow() - start_time).total_seconds()
                logger.debug(f"[BACKLOG LOOP] Backlog run #{backlog_count} completed in {duration:.2f} seconds")

            except Exception as e:
                duration = (datetime.utcnow() - start_time).total_seconds()
                logger.error(f"[BACKLOG LOOP] Error in backlog run #{backlog_count} after {duration:.2f} seconds: {e}")

            # Sleep for configured interval
            logger.debug(f"[BACKLOG LOOP] Sleeping for {settings.MAIL_SYNC_BACKLOG_INTERVAL_SECONDS} seconds until next backlog run")
            await asyncio.sleep(settings.MAIL_SYNC_BACKLOG_INTERVAL_SECONDS)

    async def run_sync_loop(self):
        """Run the periodic email sync loop for all users."""
        import asyncio

        logger.info("[SYNC LOOP] Starting email sync loop with interval {} seconds".format(settings.MAIL_SYNC_INTERVAL_SECONDS))

        sync_count = 0
        while True:
            sync_count += 1
            start_time = datetime.utcnow()

            try:
                logger.info(f"[SYNC LOOP] Starting sync run #{sync_count}")
                await self.sync_all_users()
                duration = (datetime.utcnow() - start_time).total_seconds()
                logger.info(f"[SYNC LOOP] Sync run #{sync_count} completed in {duration:.2f} seconds")

                # Also run embedding processing if needed
                # await self.process_embedding_queue()  # This was in MailService

            except Exception as e:
                duration = (datetime.utcnow() - start_time).total_seconds()
                logger.error(f"[SYNC LOOP] Error in sync run #{sync_count} after {duration:.2f} seconds: {e}")

            # Sleep for configured interval
            logger.debug(f"[SYNC LOOP] Sleeping for {settings.MAIL_SYNC_INTERVAL_SECONDS} seconds until next sync")
            await asyncio.sleep(settings.MAIL_SYNC_INTERVAL_SECONDS)
