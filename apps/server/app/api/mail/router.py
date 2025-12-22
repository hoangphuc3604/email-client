from fastapi import APIRouter, Depends, HTTPException, Query, Response, Form, UploadFile, File
from typing import List, Optional
from urllib.parse import quote
import logging
from app.api.auth.dependencies import get_current_user
from app.api.auth.models import UserInfo
from app.api.mail.service import MailService
from app.api.mail.dependencies import get_mail_service
from app.api.mail.models import SnoozeEmailRequest, SemanticSearchRequest

logger = logging.getLogger(__name__)
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
    summarize: bool = Query(False, description="If true, include AI summary"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Get paginated thread list for a mailbox. Returns lightweight thread IDs with historyIds."""
    result = await mail_service.get_emails(current_user.id, mailbox_id, page_token, limit, summarize)
    return APIResponse(data=result, message="Emails retrieved successfully")


@router.get("/emails/{email_id}", response_model=APIResponse[ThreadDetailResponse])
async def get_email_detail(
    email_id: str,
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user),
    summarize: bool = Query(False, description="If true, include AI summary")
):
    """Get full thread detail with all messages and metadata."""
    try:
        email_detail = await mail_service.get_email_detail(current_user.id, email_id, summarize)
        return APIResponse(data=email_detail, message="Email retrieved successfully")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emails/{email_id}/reply", response_model=APIResponse[dict])
async def reply_email(
    email_id: str,
    to: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    attachments: Optional[List[UploadFile]] = File(None),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Reply to an email with optional attachments."""
    try:
        # Prepare reply data
        reply_data = {
            "to": to,
            "subject": subject,
            "body": body
        }
        
        # Process attachments if provided
        attachment_list = []
        if attachments:
            MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB Gmail limit
            for attachment in attachments:
                # Read file content
                content = await attachment.read()
                
                # Validate file size
                if len(content) > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Attachment '{attachment.filename}' exceeds 25MB limit"
                    )
                
                # Get MIME type
                mime_type = attachment.content_type
                if not mime_type:
                    # Try to guess from filename
                    import mimetypes
                    mime_type, _ = mimetypes.guess_type(attachment.filename or '')
                    if not mime_type:
                        mime_type = 'application/octet-stream'
                
                attachment_list.append({
                    "filename": attachment.filename or "attachment",
                    "content": content,
                    "mime_type": mime_type
                })
        
        result = await mail_service.reply_email(current_user.id, email_id, reply_data, attachment_list)
        return APIResponse(data=result, message="Reply sent successfully")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reply to email: {str(e)}")


@router.post("/emails/send", response_model=APIResponse[dict])
async def send_email(
    to: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    cc: Optional[str] = Form(None),
    bcc: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Send a new email with optional attachments."""
    try:
        # Prepare email data
        email_data = {
            "to": to,
            "subject": subject,
            "body": body,
            "cc": cc,
            "bcc": bcc
        }
        
        # Process attachments if provided
        attachment_list = []
        if attachments:
            MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB Gmail limit
            for attachment in attachments:
                # Read file content
                content = await attachment.read()
                
                # Validate file size
                if len(content) > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Attachment '{attachment.filename}' exceeds 25MB limit"
                    )
                
                # Get MIME type
                mime_type = attachment.content_type
                if not mime_type:
                    # Try to guess from filename
                    import mimetypes
                    mime_type, _ = mimetypes.guess_type(attachment.filename or '')
                    if not mime_type:
                        mime_type = 'application/octet-stream'
                
                attachment_list.append({
                    "filename": attachment.filename or "attachment",
                    "content": content,
                    "mime_type": mime_type
                })
        
        result = await mail_service.send_email(current_user.id, email_data, attachment_list)
        return APIResponse(data=result, message="Email sent successfully")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


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
        print(f"[ROUTER] POST /emails/{email_id}/modify - user: {current_user.id}")
        print(f"[ROUTER] Updates: {updates.model_dump()}")
        
        # Convert to dict and filter out None values
        update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
        
        if not update_dict:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        updated_email = await mail_service.modify_email(current_user.id, email_id, update_dict)
        return APIResponse(data=updated_email, message="Email updated successfully")
    except Exception as e:
        print(f"[ROUTER] Error in modify_email: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/drafts", response_model=APIResponse[dict])
async def create_draft(
    to: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    cc: Optional[str] = Form(None),
    bcc: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Create a draft email with optional attachments."""
    try:
        # Prepare draft data
        draft_data = {
            "to": to,
            "subject": subject,
            "body": body,
            "cc": cc,
            "bcc": bcc
        }
        
        # Process attachments if provided
        attachment_list = []
        if attachments:
            MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB Gmail limit
            for attachment in attachments:
                # Read file content
                content = await attachment.read()
                
                # Validate file size
                if len(content) > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Attachment '{attachment.filename}' exceeds 25MB limit"
                    )
                
                # Get MIME type
                mime_type = attachment.content_type
                if not mime_type:
                    # Try to guess from filename
                    import mimetypes
                    mime_type, _ = mimetypes.guess_type(attachment.filename or '')
                    if not mime_type:
                        mime_type = 'application/octet-stream'
                
                attachment_list.append({
                    "filename": attachment.filename or "attachment",
                    "content": content,
                    "mime_type": mime_type
                })
        
        result = await mail_service.create_draft(current_user.id, draft_data, attachment_list)
        return APIResponse(data=result, message="Draft created successfully")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create draft: {str(e)}")


@router.get("/attachments")
async def get_attachment(
    attachmentId: str = Query(..., description="Attachment ID"),
    messageId: str = Query(..., description="Message ID containing the attachment"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Download attachment with proper headers."""
    try:
        result = await mail_service.get_attachment(current_user.id, messageId, attachmentId)
        
        logger.info(f"[Router] Received from service - filename: {result['filename']}, mime_type: {result['mime_type']}")
        
        filename = result["filename"]
        filename_ascii = filename.encode('ascii', 'ignore').decode('ascii') or 'attachment'
        filename_encoded = quote(filename, safe='')
        
        logger.info(f"[Router] Filename processing - original: {filename}, ascii: {filename_ascii}, encoded: {filename_encoded}")
        
        headers = {
            "Content-Disposition": (
                f'attachment; filename="{filename_ascii}"; '
                f'filename*=UTF-8\'\'{filename_encoded}'
            ),
            "Content-Type": result["mime_type"]
        }
        
        logger.info(f"[Router] Response headers - Content-Disposition: {headers['Content-Disposition']}, Content-Type: {headers['Content-Type']}")
        
        return Response(
            content=result["data"],
            media_type=result["mime_type"],
            headers=headers
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download attachment: {str(e)}")


@router.get("/search", response_model=APIResponse[List[ThreadPreview]])
async def search_emails(
    q: str = Query(..., min_length=1, description="Search query"),
    mailbox_id: Optional[str] = Query(None, description="Optional mailbox/label filter"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    try:
        results = await mail_service.search_emails(current_user.id, q, mailbox_id, page, limit)
        return APIResponse(data=results, message="Search completed successfully")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search emails: {str(e)}")


@router.post("/search/semantic", response_model=APIResponse[List[ThreadPreview]])
async def search_emails_semantic(
    payload: SemanticSearchRequest,
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user),
):
    try:
        results = await mail_service.search_emails_semantic(
            current_user.id,
            payload.query,
            payload.mailbox_id,
            payload.page,
            payload.limit,
        )
        return APIResponse(data=results, message="Semantic search completed successfully")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to perform semantic search: {str(e)}")


@router.post("/emails/{email_id}/summarize", response_model=APIResponse[dict])
async def summarize_email(
    email_id: str,
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Summarize a single email on demand."""
    try:
        result = await mail_service.summarize_email(current_user.id, email_id)
        return APIResponse(data=result, message="Summary generated successfully")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to summarize email: {str(e)}")


@router.post("/emails/{email_id}/snooze", response_model=APIResponse[dict])
async def snooze_email_endpoint(
    email_id: str,
    payload: SnoozeEmailRequest,
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Snooze an email until a specific time."""
    try:
        result = await mail_service.snooze_email(current_user.id, email_id, payload.snooze_until)
        return APIResponse(data=result, message="Email snoozed successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync", response_model=APIResponse[dict])
async def sync_email_index(
    mailbox_id: Optional[str] = Query(None, description="Optional mailbox to sync"),
    lookback_days: int = Query(90, ge=1, le=365, description="Days to look back"),
    max_pages: int = Query(5, ge=1, le=20, description="Max pages to sync"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """
    Sync emails from Gmail to MongoDB email index for search.
    This populates the email_index collection with email metadata.
    """
    try:
        await mail_service.sync_email_index(
            current_user.id,
            mailbox_id,
            lookback_days,
            max_pages
        )
        return APIResponse(
            data={"synced": True},
            message=f"Email index synced successfully for the last {lookback_days} days"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync email index: {str(e)}")