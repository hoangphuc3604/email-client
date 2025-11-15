import asyncio
import logging
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo import AsyncMongoClient
from typing import Optional, List

from app.api.router import router as api_router
from app.config import Settings

settings = Settings()  # type: ignore

if settings.ENVIRONMENT == "development":
    root_path = ""
else:
    root_path = "/api/v1"

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

app.include_router(api_router, prefix="/api/v1")

origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
    "https://localhost:3000",
    "https://localhost:3001",
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


@app.on_event("startup")
async def app_startup():
    """Initialize database indexes if needed"""
    # You can add database initialization here
    pass


@app.on_event("shutdown")
async def app_shutdown():
    """Cleanup on shutdown"""
    pass


@app.get("/")
async def root():
    return {"message": "Email Client API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}

