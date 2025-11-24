from fastapi import APIRouter, Depends, HTTPException, Query, Response
from typing import List
from app.api.auth.dependencies import get_current_user
from app.api.auth.models import UserInfo
from app.api.mail.service import MailService
from app.api.mail.dependencies import get_mail_service
from app.api.mail.models import (
    Mailbox,
    ThreadListResponse,
    ThreadDetailResponse,
    EmailUpdateRequest,
    EmailSearchRequest,
    ThreadPreview,
    SendEmailRequest,
    ReplyEmailRequest
)
from app.models.api_response import APIResponse

router = APIRouter(prefix="/mail", tags=["Mail"])


@router.get("/mailboxes", response_model=APIResponse[List[Mailbox]])
async def get_mailboxes(
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Get all mailboxes/folders for the authenticated user."""
    mailboxes = await mail_service.get_mailboxes(current_user.id)
    return APIResponse(data=mailboxes, message="Mailboxes retrieved successfully")


@router.get("/mailboxes/{mailbox_id}/emails", response_model=APIResponse[ThreadListResponse])
async def get_emails(
    mailbox_id: str,
    page_token: str = Query(None, description="Page token for pagination"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Get paginated thread list for a mailbox. Returns lightweight thread IDs with historyIds."""
    result = await mail_service.get_emails(current_user.id, mailbox_id, page_token, limit)
    return APIResponse(data=result, message="Emails retrieved successfully")


@router.get("/emails/{email_id}", response_model=APIResponse[ThreadDetailResponse])
async def get_email_detail(
    email_id: str,
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Get full thread detail with all messages and metadata."""
    try:
        email_detail = await mail_service.get_email_detail(current_user.id, email_id)
        return APIResponse(data=email_detail, message="Email retrieved successfully")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emails/{email_id}/reply", response_model=APIResponse[dict])
async def reply_email(
    email_id: str,
    request: ReplyEmailRequest,
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Reply to an email."""
    try:
        result = await mail_service.reply_email(current_user.id, email_id, request.model_dump())
        return APIResponse(data=result, message="Reply sent successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emails/send", response_model=APIResponse[dict])
async def send_email(
    request: SendEmailRequest,
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Send a new email."""
    try:
        result = await mail_service.send_email(current_user.id, request.dict())
        return APIResponse(data=result, message="Email sent successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emails/{email_id}/modify", response_model=APIResponse[ThreadDetailResponse])
async def update_email(
    email_id: str,
    updates: EmailUpdateRequest,
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """
    Update thread properties (mark as read/unread, star, change labels, etc.).
    """
    try:
        # Convert to dict and filter out None values
        update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
        
        if not update_dict:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        updated_email = await mail_service.modify_email(current_user.id, email_id, update_dict)
        return APIResponse(data=updated_email, message="Email updated successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# @router.get("/attachments/{attachment_id}")
# async def get_attachment(
#     attachment_id: str,
#     message_id: str = Query(..., description="Message ID containing the attachment"),
#     mail_service: MailService = Depends(get_mail_service),
#     current_user: UserInfo = Depends(get_current_user)
# ):
#     """Stream attachment."""
#     try:
#         data = await mail_service.get_attachment(current_user.id, message_id, attachment_id)
#         # We don't know the mime type here easily without fetching message details again or passing it.
#         # For now, default to octet-stream or try to guess?
#         # The service just returns bytes.
#         return Response(content=data, media_type="application/octet-stream")
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
