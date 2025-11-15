from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from app.api.auth.dependencies import get_current_user
from app.api.mail import mock_data
from app.api.mail.models import (
    Mailbox,
    ThreadListResponse,
    ThreadDetailResponse,
    EmailUpdateRequest,
    EmailSearchRequest,
    ThreadPreview
)
from app.models.api_response import APIResponse

router = APIRouter(prefix="/mail", tags=["Mail"])


@router.get("/mailboxes", response_model=APIResponse[List[Mailbox]])
async def get_mailboxes(
    current_user: dict = Depends(get_current_user)
):
    """Get all mailboxes/folders for the authenticated user."""
    mailboxes = mock_data.get_mailboxes()
    return APIResponse(data=mailboxes, message="Mailboxes retrieved successfully")


@router.get("/mailboxes/{mailbox_id}/emails", response_model=APIResponse[ThreadListResponse])
async def get_emails(
    mailbox_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: dict = Depends(get_current_user)
):
    """Get paginated thread list for a mailbox. Returns lightweight thread IDs with historyIds."""
    result = mock_data.get_emails_by_mailbox(mailbox_id, page, limit)
    return APIResponse(data=result, message="Emails retrieved successfully")


@router.get("/emails/{email_id}", response_model=APIResponse[ThreadDetailResponse])
async def get_email_detail(
    email_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get full thread detail with all messages and metadata."""
    email = mock_data.get_email_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    return APIResponse(data=email, message="Email retrieved successfully")


# @router.patch("/emails/{email_id}", response_model=APIResponse[ThreadDetailResponse])
# async def update_email(
#     email_id: str,
#     updates: EmailUpdateRequest,
#     current_user: dict = Depends(get_current_user)
# ):
#     """
#     Update thread properties (mark as read/unread, star, change labels, etc.).
    
#     Args:
#         email_id: ID of the thread to update
#         updates: Properties to update
    
#     Returns updated thread data.
#     """
#     # Convert to dict and filter out None values
#     update_dict = {k: v for k, v in updates.dict().items() if v is not None}
    
#     if not update_dict:
#         raise HTTPException(status_code=400, detail="No updates provided")
    
#     email = mock_data.update_email(email_id, update_dict)
#     if not email:
#         raise HTTPException(status_code=404, detail="Email not found")
    
#     return APIResponse(data=email, message="Email updated successfully")


@router.post("/emails/search", response_model=APIResponse[List[ThreadPreview]])
async def search_emails(
    search_request: EmailSearchRequest,
    current_user: dict = Depends(get_current_user)
):
    """Search threads by query string in subject, body, and sender fields."""
    results = mock_data.search_emails(
        query=search_request.query,
        mailbox_id=search_request.mailbox_id
    )
    return APIResponse(data=results, message="Search results retrieved successfully")


# @router.delete("/emails/{email_id}")
# async def delete_email(
#     email_id: str,
#     current_user: dict = Depends(get_current_user)
# ):
#     """
#     Delete an email (move to trash).
    
#     Args:
#         email_id: ID of the email to delete
    
#     Returns success message.
#     """
#     email = mock_data.get_email_by_id(email_id)
#     if not email:
#         raise HTTPException(status_code=404, detail="Email not found")
    
#     # In mock implementation, just update labels
#     updated = mock_data.update_email(email_id, {"labels": ["trash"]})
    
#     return APIResponse(data={"message": "Email moved to trash", "email_id": email_id}, message="Email moved to trash")


# @router.post("/emails/{email_id}/star", response_model=APIResponse[ThreadDetailResponse])
# async def toggle_star(
#     email_id: str,
#     current_user: dict = Depends(get_current_user)
# ):
#     """
#     Toggle star status of an email.
    
#     Args:
#         email_id: ID of the email
    
#     Returns updated email data.
#     """
#     email = mock_data.get_email_by_id(email_id)
#     if not email:
#         raise HTTPException(status_code=404, detail="Email not found")
    
#     updated = mock_data.update_email(email_id, {"starred": not email["starred"]})
#     return APIResponse(data=updated, message="Email star status toggled successfully")


# @router.post("/emails/{email_id}/read", response_model=APIResponse[ThreadDetailResponse])
# async def mark_as_read(
#     email_id: str,
#     current_user: dict = Depends(get_current_user)
# ):
#     """
#     Mark email as read.
    
#     Args:
#         email_id: ID of the email
    
#     Returns updated email data.
#     """
#     email = mock_data.get_email_by_id(email_id)
#     if not email:
#         raise HTTPException(status_code=404, detail="Email not found")
    
#     updated = mock_data.update_email(email_id, {"unread": False})
#     return APIResponse(data=updated, message="Email marked as read successfully")


# @router.post("/emails/{email_id}/unread", response_model=APIResponse[ThreadDetailResponse])
# async def mark_as_unread(
#     email_id: str,
#     current_user: dict = Depends(get_current_user)
# ):
#     """
#     Mark email as unread.
    
#     Args:
#         email_id: ID of the email
    
#     Returns updated email data.
#     """
#     email = mock_data.get_email_by_id(email_id)
#     if not email:
#         raise HTTPException(status_code=404, detail="Email not found")
    
#     updated = mock_data.update_email(email_id, {"unread": True})
#     return APIResponse(data=updated, message="Email marked as unread successfully")
