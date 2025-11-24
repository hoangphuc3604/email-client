from fastapi import APIRouter

# Import routers here when ready
from app.api.auth.router import router as auth_router
from app.api.mail.router import router as mail_router
from app.api.mail.mock_router import router as mock_mail_router

router = APIRouter()

# Include routers here when ready
router.include_router(auth_router)
router.include_router(mail_router)
router.include_router(mock_mail_router)

