"""Pydantic models for mail API following Zero's structure."""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class Sender(BaseModel):
    """Email sender/recipient model."""
    name: Optional[str] = None
    email: str


class Label(BaseModel):
    """Email label/tag model."""
    id: str
    name: str
    type: Optional[str] = None  # system or user


class Attachment(BaseModel):
    """Email attachment model."""
    attachmentId: str
    filename: str
    mimeType: str
    size: int
    body: str
    headers: List[dict] = []


class ParsedMessage(BaseModel):
    """
    Full email message following Zero's ParsedMessage structure.
    Used in thread detail view.
    """
    id: str
    threadId: str
    connectionId: Optional[str] = None
    title: str
    subject: str
    sender: Sender
    to: List[Sender]
    cc: Optional[List[Sender]] = None
    bcc: Optional[List[Sender]] = None
    tls: bool = True
    listUnsubscribe: Optional[str] = None
    listUnsubscribePost: Optional[str] = None
    receivedOn: str  # ISO timestamp
    unread: bool = False
    body: str
    processedHtml: str
    blobUrl: str = ""
    decodedBody: Optional[str] = None
    tags: List[Label] = []
    attachments: Optional[List[Attachment]] = None
    isDraft: Optional[bool] = False
    messageId: Optional[str] = None
    references: Optional[str] = None
    inReplyTo: Optional[str] = None
    replyTo: Optional[str] = None

    class Config:
        from_attributes = True


class ThreadListItem(BaseModel):
    """
    Lightweight thread item for list views.
    Following Zero's listThreads response.
    """
    id: str
    historyId: Optional[str] = None


class ThreadListResponse(BaseModel):
    """
    Response for GET /mailboxes/:id/emails
    Following Zero's IGetThreadsResponse.
    """
    threads: List[ThreadListItem]
    nextPageToken: Optional[str] = None
    total: int
    page: int
    limit: int
    has_next: bool
    has_prev: bool


class ThreadDetailResponse(BaseModel):
    """
    Response for GET /emails/:id
    Following Zero's IGetThreadResponse structure.
    """
    messages: List[ParsedMessage]
    latest: ParsedMessage
    hasUnread: bool
    totalReplies: int
    labels: List[Label]
    isLatestDraft: Optional[bool] = False


class Mailbox(BaseModel):
    """Mailbox/folder model."""
    id: str
    name: str
    icon: Optional[str] = None
    unread_count: int = 0
    total_count: int = 0
    custom: Optional[bool] = False


class EmailUpdateRequest(BaseModel):
    """Request model for updating email properties."""
    unread: Optional[bool] = None
    starred: Optional[bool] = None
    labels: Optional[List[str]] = None


class EmailSearchRequest(BaseModel):
    """Request model for searching emails."""
    query: str = Field(..., min_length=1, description="Search query")
    mailbox_id: Optional[str] = Field(None, description="Filter by mailbox")


class ThreadPreview(BaseModel):
    """
    Thread preview for search results.
    Similar to what Zero shows in email list.
    """
    id: str
    historyId: Optional[str] = None
    subject: str
    sender: Sender
    to: List[Sender]
    receivedOn: str
    unread: bool
    tags: List[Label]
    body: str  # Preview text
