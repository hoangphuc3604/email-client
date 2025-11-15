# Archival & EOL Policy

## Data retention
- Emails retained indefinitely unless tenant configures retention policy.
- Magic link audit logs retained 90 days.
- Delete requests processed within 30 days (GDPR compliance).

## Versioning
- Maintain semantic versioning (e.g., v0.3.0).
- Support previous minor version for 90 days after release.

## End-of-life process
1. Announce EOL timeline (≥90 days notice).
2. Provide migration guides to newer versions.
3. Offer data export tools.
4. Archive documentation in `releases/`.

## Backups
- Mongo PITR backups daily.
- S3 attachments lifecycle transitions to Glacier after 180 days.

> Update when retention requirements change.

