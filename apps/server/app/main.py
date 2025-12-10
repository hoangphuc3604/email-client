import logging
from datetime import datetime
from typing import List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo import AsyncMongoClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.mail.service import MailService
from app.api.router import router as api_router
from app.config import Settings, settings  # settings used for scheduler DB client

settings = Settings()  # type: ignore

if settings.ENVIRONMENT == "development":
    root_path = ""
    router_prefix = ""
else:
    root_path = ""
    router_prefix = "/api/v1"

# Configure logging
now = datetime.now()
date_str = now.strftime("%Y-%m-%d")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s]: %(message)s",
)

try:
    file_handler = logging.FileHandler(f"logs/app-err-{date_str}.log")
except FileNotFoundError:
    import os
    os.makedirs("logs", exist_ok=True)
    file_handler = logging.FileHandler(f"logs/app-err-{date_str}.log")

file_handler.setLevel(logging.ERROR)
logger = logging.getLogger('fastapi-errors')
logger.setLevel(logging.ERROR)
logger.addHandler(file_handler)

app = FastAPI(
    title="Email Client API",
    description="REST API for Email Client with authentication and mock email endpoints",
    version="0.1.0",
    root_path=root_path
)

app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])

app.include_router(api_router, prefix=router_prefix)

origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
    "https://localhost:3000",
    "https://localhost:3001",
    "https://email-client-7xd9.onrender.com",
]

if settings.FRONTEND_URL:
    frontend_urls = settings.FRONTEND_URL.split(",")
    origins.extend([url.strip() for url in frontend_urls if url.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    logger.exception(
        f"[{datetime.now()}] Unhandled error at {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error. Reason: {exc}",
                 "traceback": tb},
    )


@app.get("/")
async def root():
    return {"message": "Email Client API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}

# Scheduler for snooze restore
scheduler = AsyncIOScheduler(
    job_defaults={"max_instances": 1, "coalesce": True, "misfire_grace_time": 30}
)


async def ensure_indexes():
    """Ensure required indexes exist (snooze processing)."""
    client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
    try:
        db = client[settings.DB_NAME]
        snoozed = db["snoozed_emails"]
        await snoozed.create_index([("snooze_until", 1), ("status", 1)])
        await snoozed.create_index([("email_id", 1), ("user_id", 1)], unique=True)
    finally:
        await client.close()


async def run_snooze_job():
    """Periodic job to restore expired snoozed emails."""
    client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
    try:
        db = client[settings.DB_NAME]
        mail_service = MailService(db)
        await mail_service.check_and_restore_snoozed_emails()
    finally:
        await client.close()


@app.on_event("startup")
async def on_startup():
    # Initialize indexes and start scheduler
    await ensure_indexes()
    scheduler.add_job(run_snooze_job, "interval", minutes=1)
    scheduler.start()
    print("Scheduler started for Snooze jobs.")


@app.on_event("shutdown")
async def on_shutdown():
    scheduler.shutdown(wait=False)