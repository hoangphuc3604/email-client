from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from app.api.mail import mock_data
from app.api.mail.models import (
    Mailbox,
    ThreadListResponse,
    ThreadDetailResponse,
    EmailUpdateRequest,
    ThreadPreview,
)
from app.models.api_response import APIResponse

router = APIRouter(prefix="/mock-mail", tags=["Mock Mail"])


@router.get("/mailboxes", response_model=APIResponse[List[Mailbox]])
async def get_mailboxes():
    """Get all mailboxes (Mock)."""
    mailboxes = mock_data.get_mailboxes()
    return APIResponse(data=mailboxes, message="Mailboxes retrieved successfully")


@router.get("/mailboxes/{mailbox_id}/emails", response_model=APIResponse[ThreadListResponse])
async def get_emails(
    mailbox_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page")
):
    """Get paginated thread list for a mailbox (Mock)."""
    result = mock_data.get_emails_by_mailbox(mailbox_id, page, limit)
    
    # Enrich threads with preview data since mock_data only returns IDs
    enriched_threads = []
    for thread_item in result["threads"]:
        thread_id = thread_item["id"]
        thread_detail = mock_data.get_email_by_id(thread_id)
        if thread_detail:
            latest = thread_detail["latest"]
            # Construct preview matching ThreadPreview model
            preview = {
                "id": thread_id,
                "history_id": thread_item["history_id"],
                "subject": latest["subject"],
                "sender": latest["sender"],
                "to": latest["to"],
                "received_on": latest["received_on"],
                "unread": latest["unread"],
                "tags": latest["tags"],
                "body": latest["body"][:150] + "..." if len(latest["body"]) > 150 else latest["body"]
            }
            enriched_threads.append(preview)
            
    response = {
        "threads": enriched_threads,
        "next_page_token": result["next_page_token"],
        "result_size_estimate": result["total"]
    }
    return APIResponse(data=response, message="Emails retrieved successfully")


@router.get("/emails/{email_id}", response_model=APIResponse[ThreadDetailResponse])
async def get_email_detail(email_id: str):
    """Get full thread detail (Mock)."""
    email_detail = mock_data.get_email_by_id(email_id)
    if not email_detail:
        raise HTTPException(status_code=404, detail="Email not found")
    return APIResponse(data=email_detail, message="Email retrieved successfully")


@router.post("/emails/{email_id}/modify", response_model=APIResponse[ThreadDetailResponse])
async def update_email(email_id: str, updates: EmailUpdateRequest):
    """Update thread properties (Mock)."""
    # Convert updates to dict, filtering None
    update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    
    updated_email = mock_data.update_email(email_id, update_dict)
    if not updated_email:
        raise HTTPException(status_code=404, detail="Email not found")
        
    return APIResponse(data=updated_email, message="Email updated successfully")


@router.get("/search", response_model=APIResponse[List[ThreadPreview]])
async def search_emails(
    q: str = Query(..., min_length=1),
    mailbox_id: Optional[str] = None
):
    """Search emails (Mock)."""
    results = mock_data.search_emails(q, mailbox_id)
    return APIResponse(data=results, message="Search completed successfully")
