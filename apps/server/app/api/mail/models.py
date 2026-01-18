"""Pydantic models for mail API following Zero's structure."""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )


class Sender(CamelModel):
    """Email sender/recipient model."""
    name: Optional[str] = None
    email: str


class Label(CamelModel):
    """Email label/tag model."""
    id: str
    name: str
    type: Optional[str] = None  # system or user


class Attachment(CamelModel):
    """Email attachment model."""
    attachment_id: str
    message_id: Optional[str] = None
    filename: str
    mime_type: str
    size: int
    body: str
    headers: List[dict] = []


class ParsedMessage(CamelModel):
    """
    Full email message following Zero's ParsedMessage structure.
    Used in thread detail view.
    """
    id: str
    thread_id: str
    connection_id: Optional[str] = None
    title: str
    subject: str
    sender: Sender
    to: List[Sender]
    cc: Optional[List[Sender]] = None
    bcc: Optional[List[Sender]] = None
    tls: bool = True
    list_unsubscribe: Optional[str] = None
    list_unsubscribe_post: Optional[str] = None
    received_on: str  # ISO timestamp
    unread: bool = False
    body: str
    processed_html: str
    blob_url: str = ""
    decoded_body: Optional[str] = None
    tags: List[Label] = []
    attachments: Optional[List[Attachment]] = None
    is_draft: Optional[bool] = False
    message_id: Optional[str] = None
    references: Optional[str] = None
    in_reply_to: Optional[str] = None
    reply_to: Optional[str] = None
    summary: Optional[str] = None


class ThreadPreview(CamelModel):
    """
    Thread preview for search results.
    Similar to what Zero shows in email list.
    """
    id: str
    history_id: Optional[str] = None
    subject: str
    sender: Sender
    to: List[Sender] = []
    received_on: str
    unread: bool
    tags: List[Label]
    body: str  # Preview text
    summary: Optional[str] = None
    has_attachments: bool = False


class ThreadListResponse(CamelModel):
    """
    Response for GET /mailboxes/:id/emails
    Following Zero's IGetThreadsResponse.
    """
    threads: List[ThreadPreview]
    next_page_token: Optional[str] = None
    result_size_estimate: int = 0


class ThreadDetailResponse(CamelModel):
    """
    Response for GET /emails/:id
    Following Zero's IGetThreadResponse structure.
    """
    messages: List[ParsedMessage]
    latest: ParsedMessage
    has_unread: bool
    total_replies: int
    labels: List[Label]
    is_latest_draft: Optional[bool] = False


class Mailbox(CamelModel):
    """Mailbox/folder model."""
    id: str
    name: str
    icon: Optional[str] = None
    unread_count: int = 0
    total_count: int = 0
    custom: Optional[bool] = False


class EmailUpdateRequest(CamelModel):
    """Request model for updating email properties."""
    unread: Optional[bool] = None
    starred: Optional[bool] = None
    labels: Optional[List[str]] = None
    trash: Optional[bool] = None


class EmailSearchRequest(CamelModel):
    """Request model for searching emails."""
    query: str = Field(..., min_length=1, description="Search query")
    mailbox_id: Optional[str] = Field(None, description="Filter by mailbox")


class SemanticSearchRequest(CamelModel):
    query: str = Field(..., min_length=1)
    mailbox_id: Optional[str] = None
    page: int = Field(1, ge=1)
    limit: int = Field(20, ge=1, le=100)


class SendEmailRequest(CamelModel):
    """Request model for sending an email."""
    to: str
    cc: Optional[str] = None
    bcc: Optional[str] = None
    subject: str
    body: str


class ReplyEmailRequest(CamelModel):
    """Request model for replying to an email."""
    to: str
    subject: str
    body: str


class ForwardEmailRequest(CamelModel):
    """Request model for forwarding an email."""
    to: str
    subject: str
    body: str

# DB Document Models for storing full email content
class EmailDocument(CamelModel):
    """
    Complete email document stored in MongoDB.
    Contains all fields needed for full email functionality.
    """
    # Core identifiers
    user_id: str
    message_id: str
    thread_id: str
    history_id: Optional[str] = None

    # Email content
    subject: str
    from_name: Optional[str] = None
    from_email: str
    to: List[Sender]
    cc: Optional[List[Sender]] = None
    bcc: Optional[List[Sender]] = None

    # Timestamps
    received_on: str  # ISO timestamp
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    # Content
    body: str  # Plain text body
    processed_html: str  # Processed HTML content
    decoded_body: Optional[str] = None
    snippet: Optional[str] = None

    # Metadata
    labels: List[str]  # Gmail label IDs
    tags: List[Label] = []  # User-friendly tags
    unread: bool = False
    has_attachments: bool = False
    attachments: Optional[List[Attachment]] = None

    # Email threading headers
    message_id_header: Optional[str] = None
    references: Optional[str] = None
    in_reply_to: Optional[str] = None

    # Search and AI features
    is_embedded: bool = False
    summary: Optional[str] = None


class MailSyncState(CamelModel):
    """Document tracking sync state for each user."""
    user_id: str
    history_id: Optional[str] = None
    last_synced_at: Optional[str] = None
    sync_version: Optional[str] = None
    full_sync_completed: bool = False


class UserLabel(CamelModel):
    """User-managed labels stored in DB."""
    user_id: str
    label_id: str
    name: str
    type: str = "user"  # system or user
    color: Optional[str] = None
    created_at: str
    updated_at: str


class KanbanColumn(CamelModel):
    """Kanban column configuration."""
    user_id: str
    column_id: str
    name: str
    label_id: Optional[str] = None  # Associated Gmail label
    order: int
    created_at: str
    updated_at: str


class SnoozeSchedule(CamelModel):
    """Snoozed email schedule."""
    user_id: str
    email_id: str
    snooze_until: str  # ISO timestamp
    status: str = "active"  # active, processed, error
    original_labels: List[str] = []
    created_at: str
    updated_at: str
    restored_at: Optional[str] = None
    last_error: Optional[str] = None


class SnoozeEmailRequest(CamelModel):
    snooze_until: datetime