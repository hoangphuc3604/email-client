from fastapi import Depends
from pymongo.database import Database
from app.database import get_db
from app.api.mail.service import MailService

async def get_mail_service(db: Database = Depends(get_db)) -> MailService:
    """Dependency to get MailService instance"""
    return MailService(db)