# Database Migrations

This directory contains migration scripts for database schema changes and data migrations.

## Available Migrations

### `migrate_full_sync.py`

**Purpose**: Backfill email documents into the `emails` collection using smart sync.

**What it does**:
- Finds all users with Gmail refresh tokens
- Performs smart sync prioritizing recent emails first (up to `MAIL_SYNC_MAX_EMAILS_PER_BATCH`)
- Stores full message content (body, headers, attachments metadata) in DB
- Updates sync state to mark sync as completed
- Skips users who already have full email data (unless `FORCE_RESYNC=1`)

**Usage**:
```bash
cd apps/server
python -m tools.migrations.migrate_full_sync
```

**Force re-sync all users** (including those with existing data):
```bash
cd apps/server
FORCE_RESYNC=1 python -m tools.migrations.migrate_full_sync
```

**Requirements**:
- All environment variables configured (DB_CONNECTION_STRING, Gmail credentials, etc.)
- Users must have valid Gmail refresh tokens
- Set `MAIL_SYNC_MAX_EMAILS_PER_BATCH` to control sync size (default: 1000)

**Output**: Logs progress for each user and final statistics.

**Safety**: Script is idempotent - can be run multiple times safely. Uses smart sync to avoid long initial loads.

### `fix_email_data.py`

**Purpose**: Fix email data for a specific user by re-syncing with full content.

**When to use**: When email documents in MongoDB only contain basic metadata instead of full email content.

**Usage**:
```bash
cd apps/server
python tools/fix_email_data.py <user_id>
```

**Example**:
```bash
cd apps/server
python tools/fix_email_data.py 695bb29b83e6872279b44dc3
```

**Requirements**:
- All environment variables configured (same as migration script)
- Valid user_id from your database

**What it does**:
- Checks current email data state for the user
- Performs smart sync to get full email content
- Reports how many emails were fixed with full data
