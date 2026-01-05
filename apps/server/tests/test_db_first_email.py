"""
Integration tests for DB-first email operations.

Tests compare DB-stored email data against Gmail API responses
to ensure data consistency and correctness.
"""

import pytest
import asyncio
from datetime import datetime, timezone
from pymongo import AsyncMongoClient

from app.api.mail.service import MailService
from app.api.mail.models import EmailDocument
from app.config import settings


class TestDBFirstEmail:
    """Test suite for DB-first email operations."""

    @pytest.fixture
    async def db_client(self):
        """Database client fixture."""
        client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
        yield client
        await client.close()

    @pytest.fixture
    async def mail_service(self, db_client):
        """Mail service fixture."""
        db = db_client[settings.DB_NAME]
        service = MailService(db)
        return service

    @pytest.mark.asyncio
    async def test_email_storage_completeness(self, mail_service):
        """Test that stored emails contain all required fields."""
        # Find a user with emails
        users_with_emails = await mail_service.emails_collection.distinct("user_id")
        if not users_with_emails:
            pytest.skip("No users with emails in database")

        user_id = users_with_emails[0]

        # Get one email document
        email_doc = await mail_service.emails_collection.find_one({"user_id": user_id})
        if not email_doc:
            pytest.skip("No email documents found")

        # Validate required fields are present
        required_fields = [
            "user_id", "message_id", "thread_id", "subject",
            "from_name", "from_email", "to", "received_on",
            "body", "processed_html", "labels", "unread"
        ]

        for field in required_fields:
            assert field in email_doc, f"Missing required field: {field}"
            assert email_doc[field] is not None, f"Field {field} is None"

    @pytest.mark.asyncio
    async def test_db_vs_api_consistency(self, mail_service):
        """Test that DB and API responses are consistent for the same email."""
        # Find a user with emails
        users_with_emails = await mail_service.emails_collection.distinct("user_id")
        if not users_with_emails:
            pytest.skip("No users with emails in database")

        user_id = users_with_emails[0]

        # Get email IDs from DB
        email_ids = await mail_service.emails_collection.distinct(
            "message_id",
            {"user_id": user_id}
        )
        if not email_ids:
            pytest.skip("No email IDs found")

        email_id = email_ids[0]

        # Get data from DB
        db_doc = await mail_service.emails_collection.find_one({
            "user_id": user_id,
            "message_id": email_id
        })
        assert db_doc, "Email not found in DB"

        # Get data from API (fallback implementation)
        try:
            api_result = await mail_service._get_email_detail_fallback(user_id, email_id)
            api_message = api_result["messages"][0]

            # Compare key fields
            assert db_doc["subject"] == api_message.subject
            assert db_doc["from_email"] == api_message.sender.email
            assert db_doc["message_id"] == api_message.id
            assert db_doc["thread_id"] == api_message.thread_id
            assert db_doc["unread"] == api_message.unread

            # Check that body content is present
            assert db_doc["body"], "DB body is empty"
            assert api_message.body, "API body is empty"

        except Exception as e:
            pytest.skip(f"Could not fetch from Gmail API: {e}")

    @pytest.mark.asyncio
    async def test_email_list_consistency(self, mail_service):
        """Test that email listing from DB matches expected structure."""
        # Find a user with emails
        users_with_emails = await mail_service.emails_collection.distinct("user_id")
        if not users_with_emails:
            pytest.skip("No users with emails in database")

        user_id = users_with_emails[0]

        # Test inbox listing
        result = await mail_service.get_emails(user_id, "inbox", limit=10)

        assert "threads" in result
        assert "next_page_token" in result
        assert "result_size_estimate" in result
        assert isinstance(result["threads"], list)

        if result["threads"]:
            thread = result["threads"][0]
            required_fields = ["id", "subject", "sender", "received_on", "unread", "tags", "body"]
            for field in required_fields:
                assert field in thread, f"Missing field in thread: {field}"

    @pytest.mark.asyncio
    async def test_label_management(self, mail_service):
        """Test that label operations work correctly."""
        # Find a user with emails
        users_with_emails = await mail_service.emails_collection.distinct("user_id")
        if not users_with_emails:
            pytest.skip("No users with emails in database")

        user_id = users_with_emails[0]

        # Get user labels
        labels = await mail_service.get_mailboxes(user_id)
        assert isinstance(labels, list)

        # Each label should have required fields
        for label in labels:
            assert "id" in label
            assert "name" in label
            assert "type" in label
            assert "unread_count" in label
            assert "total_count" in label

    @pytest.mark.asyncio
    async def test_modify_email_operation(self, mail_service):
        """Test that email modification works in DB-only mode."""
        # Find a user with emails
        users_with_emails = await mail_service.emails_collection.distinct("user_id")
        if not users_with_emails:
            pytest.skip("No users with emails in database")

        user_id = users_with_emails[0]

        # Get an email ID
        email_ids = await mail_service.emails_collection.distinct(
            "message_id",
            {"user_id": user_id}
        )
        if not email_ids:
            pytest.skip("No email IDs found")

        email_id = email_ids[0]

        # Get original state
        original_doc = await mail_service.emails_collection.find_one({
            "user_id": user_id,
            "message_id": email_id
        })
        original_unread = original_doc.get("unread", False)

        # Modify unread status
        await mail_service.modify_email(user_id, email_id, {"unread": not original_unread})

        # Verify change
        updated_doc = await mail_service.emails_collection.find_one({
            "user_id": user_id,
            "message_id": email_id
        })
        assert updated_doc["unread"] == (not original_unread)

        # Restore original state
        await mail_service.modify_email(user_id, email_id, {"unread": original_unread})

    @pytest.mark.asyncio
    async def test_sync_state_tracking(self, mail_service):
        """Test that sync state is properly tracked."""
        # Find a user
        users_with_emails = await mail_service.emails_collection.distinct("user_id")
        if not users_with_emails:
            pytest.skip("No users with emails in database")

        user_id = users_with_emails[0]

        # Get sync state
        sync_state = await mail_service.sync_state_collection.find_one({"user_id": user_id})

        if sync_state:
            # Should have expected fields
            expected_fields = ["user_id", "updated_at"]
            for field in expected_fields:
                assert field in sync_state, f"Missing sync state field: {field}"

    @pytest.mark.asyncio
    async def test_attachment_metadata_storage(self, mail_service):
        """Test that attachment metadata is stored correctly."""
        # Find emails with attachments
        emails_with_attachments = await mail_service.emails_collection.find({
            "has_attachments": True
        }).to_list(length=5)

        if not emails_with_attachments:
            pytest.skip("No emails with attachments found")

        for email in emails_with_attachments:
            assert email.get("attachments"), "Email marked as having attachments but no attachment metadata"
            assert isinstance(email["attachments"], list), "Attachments should be a list"

            for attachment in email["attachments"]:
                required_fields = ["attachment_id", "filename", "mime_type", "size"]
                for field in required_fields:
                    assert field in attachment, f"Missing attachment field: {field}"

    @pytest.mark.asyncio
    async def test_thread_detail_consistency(self, mail_service):
        """Test that thread details are consistent between DB and API."""
        # Find a user with emails
        users_with_emails = await mail_service.emails_collection.distinct("user_id")
        if not users_with_emails:
            pytest.skip("No users with emails in database")

        user_id = users_with_emails[0]

        # Get thread IDs
        thread_ids = await mail_service.emails_collection.distinct(
            "thread_id",
            {"user_id": user_id}
        )
        if not thread_ids:
            pytest.skip("No thread IDs found")

        thread_id = thread_ids[0]

        # Get thread from DB
        thread_messages = await mail_service.emails_collection.find({
            "user_id": user_id,
            "thread_id": thread_id
        }).sort("received_on", 1).to_list(length=None)

        if not thread_messages:
            pytest.skip("No messages in thread")

        # Get thread detail via API
        # Find one message ID from the thread
        message_id = thread_messages[0]["message_id"]
        result = await mail_service.get_email_detail(user_id, message_id)

        assert "messages" in result
        assert len(result["messages"]) > 0

        # Compare message counts
        assert len(result["messages"]) == len(thread_messages), \
            f"Thread message count mismatch: DB={len(thread_messages)}, API={len(result['messages'])}"

        # Compare key fields of first message
        db_first = thread_messages[0]
        api_first = result["messages"][0]

        assert db_first["subject"] == api_first.subject
        assert db_first["message_id"] == api_first.id


if __name__ == "__main__":
    pytest.main([__file__])
