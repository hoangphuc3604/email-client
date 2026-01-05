#!/usr/bin/env python3
"""
Migration script to backfill full email documents into the emails collection using smart sync.

This script reads all existing users and performs a smart sync from Gmail API
that prioritizes recent emails first, up to MAIL_SYNC_MAX_EMAILS_PER_BATCH limit.
This provides a faster initial sync compared to full historical sync.

The script will skip users who already have full email data (with subject field).

Usage:
    python -m tools.migrations.migrate_full_sync

To force re-sync all users (including those with existing data):
    FORCE_RESYNC=1 python -m tools.migrations.migrate_full_sync

Environment variables required:
    - DB_CONNECTION_STRING
    - DB_NAME
    - MAIL_SYNC_MAX_EMAILS_PER_BATCH (default: 1000)
    - FORCE_RESYNC (optional: set to 1 to force re-sync all users)
    - All other config settings
"""

import asyncio
import logging
import os
import sys
from datetime import datetime
from typing import List

# Add the app directory to Python path
sys.path.insert(0, '../../..')

from pymongo import AsyncMongoClient
from app.config import settings
from app.api.mail.sync_service import EmailSyncService


async def migrate_users():
    """Migrate all users to have full email documents in DB."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )
    logger = logging.getLogger(__name__)

    force_resync = os.getenv('FORCE_RESYNC', '0').lower() in ('1', 'true', 'yes')
    if force_resync:
        logger.info("FORCE_RESYNC enabled - will re-sync all users including those with existing data")
    else:
        logger.info("Starting full email sync migration (skipping users with existing full data)...")

    # Connect to database
    client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
    db = client[settings.DB_NAME]

    try:
        # Get all users with Gmail tokens
        users_cursor = db["users"].find({"google_refresh_token": {"$exists": True}})
        users = await users_cursor.to_list(length=None)

        if not users:
            logger.warning("No users with Gmail tokens found")
            return

        logger.info(f"Found {len(users)} users to migrate")

        sync_service = EmailSyncService(db)

        # Process each user
        for i, user in enumerate(users, 1):
            user_id = str(user["_id"])
            email = user.get("email", "unknown")

            logger.info(f"[{i}/{len(users)}] Migrating user {email} (ID: {user_id})")

            try:
                # Check if user already has sync state
                sync_state = await db["mail_sync_state"].find_one({"user_id": user_id})

                # Check if user already has full email data (not just metadata)
                existing_full_emails = await db["emails"].count_documents({
                    "user_id": user_id,
                    "subject": {"$exists": True}  # Check if full data exists
                })

                if existing_full_emails > 0 and not force_resync:
                    logger.info(f"User {email} already has {existing_full_emails} full emails, skipping migration (use FORCE_RESYNC=1 to override)")
                    continue
                elif existing_full_emails > 0 and force_resync:
                    logger.info(f"User {email} has {existing_full_emails} full emails but FORCE_RESYNC enabled, re-syncing...")

                # Perform smart sync for this user (prioritizes recent emails)
                await sync_service.sync_email_index(
                    user_id=user_id,
                    max_emails=settings.MAIL_SYNC_MAX_EMAILS_PER_BATCH
                )

                # Count emails migrated
                email_count = await db["emails"].count_documents({"user_id": user_id})
                full_email_count = await db["emails"].count_documents({
                    "user_id": user_id,
                    "subject": {"$exists": True}
                })
                logger.info(f"User {email} migrated {email_count} emails ({full_email_count} with full data)")

            except Exception as e:
                logger.error(f"Failed to migrate user {email}: {e}")
                continue

        # Final statistics
        total_emails = await db["emails"].count_documents({})
        total_users_migrated = len([u for u in users if await db["emails"].count_documents({"user_id": str(u["_id"])}) > 0])

        logger.info("Migration completed!")
        logger.info(f"Total emails in DB: {total_emails}")
        logger.info(f"Users with emails: {total_users_migrated}/{len(users)}")

    finally:
        await client.close()


async def main():
    """Main entry point."""
    try:
        await migrate_users()
        print("Migration completed successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
