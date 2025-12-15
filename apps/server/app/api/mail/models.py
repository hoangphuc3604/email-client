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

# Thêm vào cuối file hoặc chỗ phù hợp
class SnoozeEmailRequest(CamelModel):
    snooze_until: datetime