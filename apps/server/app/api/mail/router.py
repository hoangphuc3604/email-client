from fastapi import APIRouter, Depends, HTTPException, Query, Response, Form, UploadFile, File
from typing import List, Optional
from urllib.parse import quote
import logging
from app.api.auth.dependencies import get_current_user
from app.api.auth.models import UserInfo
from app.config import settings
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
    max_emails: Optional[int] = Query(None, ge=1, le=10000, description="Max emails to sync (default from config)"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """
    Smart sync emails prioritizing newest first.
    Syncs incremental updates and fills gaps with recent emails.
    """
    try:
        await mail_service.sync_email_index(
            current_user.id,
            mailbox_id,
            max_emails
        )
        email_count = await mail_service.emails_collection.count_documents({"user_id": current_user.id})
        return APIResponse(
            data={"synced": True, "email_count": email_count},
            message=f"Smart email sync completed successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync emails: {str(e)}")


@router.get("/labels", response_model=APIResponse[List[dict]])
async def get_gmail_labels(
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Get all Gmail labels for the authenticated user."""
    try:
        labels = await mail_service.get_all_labels(current_user.id)
        return APIResponse(data=labels, message="Labels retrieved successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/labels", response_model=APIResponse[dict])
async def create_gmail_label(
    name: str = Query(..., description="Label name to create"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Create a new Gmail label."""
    try:
        label = await mail_service.create_label(current_user.id, name)
        return APIResponse(data=label, message="Label created successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Admin endpoints for sync management
@router.post("/admin/sync/trigger", response_model=APIResponse[dict])
async def trigger_sync(
    mailbox_id: Optional[str] = Query(None, description="Optional mailbox to sync"),
    max_emails: Optional[int] = Query(None, ge=1, le=10000, description="Max emails to sync"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Manually trigger smart email sync for the current user."""
    try:
        await mail_service.sync_email_index(
            current_user.id,
            mailbox_id,
            max_emails
        )
        email_count = await mail_service.emails_collection.count_documents({"user_id": current_user.id})
        return APIResponse(
            data={"triggered": True, "email_count": email_count},
            message=f"Smart sync triggered for user {current_user.id}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger sync: {str(e)}")


@router.get("/admin/sync/status", response_model=APIResponse[dict])
async def get_sync_status(
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Get sync status for the current user."""
    try:
        # Get sync state from DB
        sync_state = await mail_service.sync_state_collection.find_one({"user_id": current_user.id})

        if not sync_state:
            return APIResponse(
                data={
                    "user_id": current_user.id,
                    "full_sync_completed": False,
                    "last_synced_at": None,
                    "sync_version": None,
                    "history_id": None
                },
                message="No sync state found"
            )

        # Count emails in DB
        email_count = await mail_service.emails_collection.count_documents({"user_id": current_user.id})

        return APIResponse(
            data={
                "user_id": current_user.id,
                "full_sync_completed": sync_state.get("full_sync_completed", False),
                "last_synced_at": sync_state.get("last_synced_at"),
                "sync_version": sync_state.get("sync_version"),
                "history_id": sync_state.get("history_id"),
                "email_count": email_count
            },
            message="Sync status retrieved"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get sync status: {str(e)}")


@router.post("/admin/sync/startup", response_model=APIResponse[dict])
async def trigger_startup_sync(
    max_emails: Optional[int] = Query(None, ge=1, le=10000, description="Max emails to sync"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Trigger a smart startup sync prioritizing recent emails."""
    try:
        await mail_service.sync_email_index(
            current_user.id,
            max_emails=max_emails
        )
        email_count = await mail_service.emails_collection.count_documents({"user_id": current_user.id})
        return APIResponse(
            data={"startup_sync_triggered": True, "email_count": email_count},
            message=f"Smart startup sync triggered for user {current_user.id}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger startup sync: {str(e)}")


@router.get("/admin/stats", response_model=APIResponse[dict])
async def get_admin_stats(
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Get admin statistics for the current user."""
    try:
        # Email counts by label
        pipeline = [
            {"$match": {"user_id": current_user.id}},
            {"$unwind": "$labels"},
            {"$group": {"_id": "$labels", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        label_stats = await mail_service.emails_collection.aggregate(pipeline).to_list(length=None)

        # Total emails
        total_emails = await mail_service.emails_collection.count_documents({"user_id": current_user.id})

        # Unread count
        unread_count = await mail_service.emails_collection.count_documents({
            "user_id": current_user.id,
            "unread": True
        })

        # Sync state
        sync_state = await mail_service.sync_state_collection.find_one({"user_id": current_user.id})

        return APIResponse(
            data={
                "total_emails": total_emails,
                "unread_count": unread_count,
                "label_breakdown": label_stats,
                "sync_state": {
                    "full_sync_completed": sync_state.get("full_sync_completed", False) if sync_state else False,
                    "last_synced_at": sync_state.get("last_synced_at") if sync_state else None
                }
            },
            message="Admin stats retrieved"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get admin stats: {str(e)}")


@router.post("/admin/backlog/process", response_model=APIResponse[dict])
async def process_backlog(
    user_id: str = Query(..., description="User ID to process backlog for"),
    max_pages: Optional[int] = Query(None, ge=1, le=10, description="Max pages to process (default from config)"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """
    Manually trigger backlog processing for a specific user.
    This will process older emails that were skipped due to batch limits.
    """
    try:
        # Get sync service from mail service
        sync_service = mail_service.sync_service if hasattr(mail_service, 'sync_service') else None
        if not sync_service:
            # Create sync service if not available
            from app.api.mail.sync_service import EmailSyncService
            sync_service = EmailSyncService(mail_service.db)

        result = await sync_service._process_backlog(user_id, max_pages)
        return APIResponse(
            data=result,
            message=f"Backlog processing completed for user {user_id}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process backlog: {str(e)}")


@router.get("/admin/backlog/status", response_model=APIResponse[dict])
async def get_backlog_status(
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """
    Get backlog processing status for all users.
    Shows which users have pending backlog and their progress.
    """
    try:
        # Get sync service
        sync_service = mail_service.sync_service if hasattr(mail_service, 'sync_service') else None
        if not sync_service:
            from app.api.mail.sync_service import EmailSyncService
            sync_service = EmailSyncService(mail_service.db)

        # Get all users with backlog
        backlog_users = await sync_service.sync_state_collection.find(
            {"backlog_cursor": {"$ne": None}},
            {
                "user_id": 1,
                "backlog_cursor": 1,
                "backlog_mode": 1,
                "backlog_last_processed_at": 1,
                "updated_at": 1
            }
        ).to_list(length=None)

        # Count total users and emails
        total_users = await sync_service.sync_state_collection.count_documents({})
        total_emails = await sync_service.emails_collection.count_documents({})

        backlog_summary = []
        for user in backlog_users:
            # Count emails for this user
            user_emails = await sync_service.emails_collection.count_documents({"user_id": user["user_id"]})

            backlog_summary.append({
                "user_id": user["user_id"],
                "backlog_cursor": user.get("backlog_cursor")[:50] + "..." if user.get("backlog_cursor") else None,
                "backlog_mode": user.get("backlog_mode"),
                "backlog_last_processed_at": user.get("backlog_last_processed_at"),
                "last_updated": user.get("updated_at"),
                "email_count": user_emails
            })

        return APIResponse(
            data={
                "total_users": total_users,
                "users_with_backlog": len(backlog_summary),
                "total_emails": total_emails,
                "backlog_users": backlog_summary
            },
            message="Backlog status retrieved"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get backlog status: {str(e)}")


@router.post("/admin/sync/full_resync", response_model=APIResponse[dict])
async def trigger_full_resync(
    user_id: str = Query(..., description="User ID to perform full resync for"),
    max_emails: Optional[int] = Query(10000, ge=1, le=50000, description="Max emails to sync"),
    mail_service: MailService = Depends(get_mail_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """
    Trigger a full resync for a user, clearing sync state and re-syncing from scratch.
    This is useful when DB is missing many emails or sync state is corrupted.
    """
    try:
        # Get sync service
        sync_service = mail_service.sync_service if hasattr(mail_service, 'sync_service') else None
        if not sync_service:
            from app.api.mail.sync_service import EmailSyncService
            sync_service = EmailSyncService(mail_service.db)

        # Clear sync state to force full resync
        await sync_service.sync_state_collection.update_one(
            {"user_id": user_id},
            {"$unset": {
                "history_id": 1,
                "full_sync_completed": 1,
                "backlog_cursor": 1,
                "backlog_mode": 1,
                "backlog_last_processed_at": 1
            }},
            upsert=True
        )

        logger.info(f"[FULL RESYNC] Cleared sync state for user {user_id}, starting full resync")

        # Trigger sync with high limit
        result = await sync_service.sync_email_index(user_id, max_emails=max_emails)

        return APIResponse(
            data={
                "user_id": user_id,
                "sync_result": result,
                "message": "Full resync triggered - sync state cleared and fresh sync initiated"
            },
            message=f"Full resync initiated for user {user_id}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger full resync: {str(e)}")