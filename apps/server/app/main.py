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
from app.api.mail.sync_service import EmailSyncService
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
        email_index = db["email_index"]
        await email_index.create_index([("user_id", 1), ("message_id", 1)], unique=True)
        await email_index.create_index([("received_on", -1)])
        await email_index.create_index([("is_embedded", 1), ("received_on", -1)])
        sync_state = db["mail_sync_state"]
        await sync_state.create_index([("user_id", 1)], unique=True)
        email_embeddings = db["email_embeddings"]
        await email_embeddings.create_index([("user_id", 1), ("message_id", 1)], unique=True)
        await email_embeddings.create_index([("user_id", 1)])

        # DB-first architecture indexes
        emails = db["emails"]
        await emails.create_index([("user_id", 1), ("message_id", 1)], unique=True)
        await emails.create_index([("user_id", 1), ("thread_id", 1)])
        await emails.create_index([("user_id", 1), ("labels", 1)])
        await emails.create_index([("user_id", 1), ("received_on", -1)])
        await emails.create_index([("user_id", 1), ("has_attachments", 1)])

        labels = db["labels"]
        await labels.create_index([("user_id", 1), ("label_id", 1)], unique=True)

        kanban_columns = db["kanban_columns"]
        await kanban_columns.create_index([("user_id", 1), ("column_id", 1)], unique=True)
        await kanban_columns.create_index([("user_id", 1), ("order", 1)])

        snooze_schedules = db["snooze_schedules"]
        await snooze_schedules.create_index([("user_id", 1), ("email_id", 1)], unique=True)
        await snooze_schedules.create_index([("snooze_until", 1), ("status", 1)])
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


async def run_mail_sync_job():
    """Periodic job to sync Gmail emails into DB."""
    client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
    try:
        db = client[settings.DB_NAME]
        sync_service = EmailSyncService(db)
        await sync_service.sync_all_users()
    finally:
        await client.close()


async def run_embedding_job():
    """Periodic job to generate embeddings for new emails."""
    client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
    try:
        db = client[settings.DB_NAME]
        mail_service = MailService(db)
        await mail_service.process_embedding_queue()
    finally:
        await client.close()


@app.on_event("startup")
async def on_startup():
    # Initialize indexes and start scheduler
    await ensure_indexes()

    # DB-first sync initialization
    if settings.MAIL_SYNC_STARTUP_FULL:
        logging.info("[STARTUP] Running initial full sync for all users...")
        client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
        try:
            db = client[settings.DB_NAME]
            sync_service = EmailSyncService(db)
            await sync_service.sync_all_users()
            logging.info("[STARTUP] Initial smart sync completed")
        finally:
            await client.close()

    # Start in-process sync loop
    import asyncio
    client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
    db = client[settings.DB_NAME]
    sync_service = EmailSyncService(db)

    # Run sync loop in background
    asyncio.create_task(sync_service.run_sync_loop())
    logging.info(f"[STARTUP] In-process sync loop started (interval: {settings.MAIL_SYNC_INTERVAL_SECONDS}s)")

    # Legacy scheduler jobs
    scheduler.add_job(run_snooze_job, "interval", minutes=1)
    scheduler.add_job(
        run_embedding_job,
        "interval",
        minutes=settings.EMBEDDING_JOB_INTERVAL_MINUTES,
        next_run_time=datetime.now(),
        id="embedding_job",
        replace_existing=True,
    )
    scheduler.start()
    logging.info(f"Scheduler configured: snooze_job every 1 minute; embedding_job every {settings.EMBEDDING_JOB_INTERVAL_MINUTES} minutes")
    print("Scheduler started for background jobs.")


@app.on_event("shutdown")
async def on_shutdown():
    scheduler.shutdown(wait=False)