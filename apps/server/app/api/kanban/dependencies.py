"""Dependencies for Kanban API."""

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase
from app.database import get_db
from app.api.kanban.service import KanbanService
from app.api.mail.service import MailService
from app.api.mail.dependencies import get_mail_service


async def get_kanban_service(
    db: AsyncDatabase = Depends(get_db),
    mail_service: MailService = Depends(get_mail_service)
) -> KanbanService:
    """Dependency to get KanbanService instance."""
    return KanbanService(db, mail_service)

