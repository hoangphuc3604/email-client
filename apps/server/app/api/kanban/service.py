"""Service layer for Kanban board configuration."""

from pymongo.asynchronous.database import AsyncDatabase
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
import logging
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

from app.api.kanban.models import (
    KanbanColumnCreate,
    KanbanColumnUpdate,
    KanbanColumnResponse,
    KanbanConfigResponse,
    MoveCardRequest
)
from app.api.mail.service import MailService
from app.utils.security import decrypt_token
from app.config import settings

logger = logging.getLogger(__name__)


class KanbanService:
    """Service for managing Kanban board configurations."""
    
    def __init__(self, db: AsyncDatabase, mail_service: MailService):
        self.db = db
        self.mail_service = mail_service
        self.config_collection = self.db["kanban_configs"]
    
    async def get_gmail_service(self, user_id: str):
        """Get Gmail API service for a user."""
        user = await self.mail_service.users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise ValueError(f"User {user_id} not found")
        
        encrypted_token = user.get("google_refresh_token")
        if not encrypted_token:
            raise ValueError("User has no refresh token")
        
        refresh_token = decrypt_token(encrypted_token)
        credentials = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET
        )
        
        return build('gmail', 'v1', credentials=credentials)
    
    async def _get_or_create_label_id(self, service, user_id: str, label_name: str) -> str:
        """Get or create a Gmail label and return its ID."""
        # Map system labels
        SYSTEM_LABELS = {
            'INBOX': 'INBOX',
            'TRASH': 'TRASH',
            'SPAM': 'SPAM',
            'UNREAD': 'UNREAD',
            'STARRED': 'STARRED',
            'SENT': 'SENT',
            'DRAFT': 'DRAFT'
        }
        label_upper = label_name.upper()
        
        if label_upper in SYSTEM_LABELS:
            return SYSTEM_LABELS[label_upper]
        
        # Normalize display name
        display_name = label_name.title()
        if label_upper == "TODO":
            display_name = "To Do"
        
        try:
            # Get all existing labels
            results = service.users().labels().list(userId='me').execute()
            labels = results.get('labels', [])
            
            # Find existing label
            for label in labels:
                if label['name'].lower() == display_name.lower():
                    return label['id']
            
            # Create new label
            logger.info(f"Creating new Gmail label: {display_name}")
            created_label = service.users().labels().create(
                userId='me',
                body={
                    'name': display_name,
                    'labelListVisibility': 'labelShow',
                    'messageListVisibility': 'show'
                }
            ).execute()
            return created_label['id']
        except Exception as e:
            logger.error(f"Error getting/creating label {label_name}: {str(e)}")
            raise ValueError(f"Failed to get or create Gmail label: {str(e)}")
    
    async def _resolve_gmail_label(
        self,
        service,
        user_id: str,
        label_id: Optional[str],
        label_name: Optional[str]
    ) -> tuple[str, str]:
        """Resolve Gmail label ID and name from either ID or name."""
        if label_id:
            # If ID provided, fetch the label to get its name
            try:
                label = service.users().labels().get(userId='me', id=label_id).execute()
                return label_id, label['name']
            except Exception as e:
                logger.warning(f"Label ID {label_id} not found, will create new label: {e}")
                # Fall through to create new label
        
        if label_name:
            # Create or get label by name
            resolved_id = await self._get_or_create_label_id(service, user_id, label_name)
            return resolved_id, label_name
        
        raise ValueError("Either gmail_label_id or gmail_label_name must be provided")
    
    async def _create_default_config(self, user_id: str) -> Dict[str, Any]:
        """Create default Kanban configuration for a new user."""
        service = await self.get_gmail_service(user_id)
        
        # Default columns
        default_columns = [
            {"name": "Inbox", "gmail_label_name": "INBOX"},
            {"name": "To Do", "gmail_label_name": "To Do"},
            {"name": "Snoozed", "gmail_label_name": "SNOOZED"},
            {"name": "Done", "gmail_label_name": "Done"}
        ]
        
        columns = []
        for idx, col_def in enumerate(default_columns):
            label_id, label_name = await self._resolve_gmail_label(
                service, user_id, None, col_def["gmail_label_name"]
            )
            columns.append({
                "id": f"col_{idx + 1}",
                "name": col_def["name"],
                "gmail_label_id": label_id,
                "gmail_label_name": label_name,
                "order": idx,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            })
        
        config = {
            "user_id": user_id,
            "columns": columns,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        await self.config_collection.insert_one(config)
        return config
    
    async def get_config(self, user_id: str) -> KanbanConfigResponse:
        """Get user's Kanban configuration, create default if not exists."""
        config = await self.config_collection.find_one({"user_id": user_id})
        
        if not config:
            # Create default config
            config = await self._create_default_config(user_id)
        
        # Convert to response model
        columns = [
            KanbanColumnResponse(
                id=col["id"],
                name=col["name"],
                gmail_label_id=col["gmail_label_id"],
                gmail_label_name=col["gmail_label_name"],
                order=col["order"]
            )
            for col in sorted(config["columns"], key=lambda x: x["order"])
        ]
        
        return KanbanConfigResponse(user_id=user_id, columns=columns)
    
    async def create_column(
        self,
        user_id: str,
        column: KanbanColumnCreate
    ) -> KanbanColumnResponse:
        """Create a new Kanban column."""
        config = await self.config_collection.find_one({"user_id": user_id})
        
        if not config:
            config_doc = await self._create_default_config(user_id)
            config = await self.config_collection.find_one({"user_id": user_id})
        
        # Resolve Gmail label
        service = await self.get_gmail_service(user_id)
        label_id, label_name = await self._resolve_gmail_label(
            service, user_id, column.gmail_label_id, column.gmail_label_name
        )
        
        # Generate new column ID
        existing_ids = [col["id"] for col in config["columns"]]
        col_num = 1
        while f"col_{col_num}" in existing_ids:
            col_num += 1
        new_id = f"col_{col_num}"
        
        # Create column document
        new_column = {
            "id": new_id,
            "name": column.name,
            "gmail_label_id": label_id,
            "gmail_label_name": label_name,
            "order": column.order,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        # Update config
        config["columns"].append(new_column)
        config["updated_at"] = datetime.utcnow().isoformat()
        
        await self.config_collection.update_one(
            {"user_id": user_id},
            {"$set": {"columns": config["columns"], "updated_at": config["updated_at"]}}
        )
        
        return KanbanColumnResponse(
            id=new_column["id"],
            name=new_column["name"],
            gmail_label_id=new_column["gmail_label_id"],
            gmail_label_name=new_column["gmail_label_name"],
            order=new_column["order"]
        )
    
    async def update_column(
        self,
        user_id: str,
        column_id: str,
        updates: KanbanColumnUpdate
    ) -> KanbanColumnResponse:
        """Update a Kanban column."""
        config = await self.config_collection.find_one({"user_id": user_id})
        
        if not config:
            raise ValueError("Kanban config not found")
        
        # Find column
        column_idx = None
        for idx, col in enumerate(config["columns"]):
            if col["id"] == column_id:
                column_idx = idx
                break
        
        if column_idx is None:
            raise ValueError(f"Column {column_id} not found")
        
        column = config["columns"][column_idx]
        
        # Update fields
        if updates.name is not None:
            column["name"] = updates.name
        
        if updates.order is not None:
            column["order"] = updates.order
        
        # Update Gmail label if provided
        if updates.gmail_label_id is not None or updates.gmail_label_name is not None:
            service = await self.get_gmail_service(user_id)
            label_id, label_name = await self._resolve_gmail_label(
                service, user_id, updates.gmail_label_id, updates.gmail_label_name
            )
            column["gmail_label_id"] = label_id
            column["gmail_label_name"] = label_name
        
        column["updated_at"] = datetime.utcnow().isoformat()
        config["updated_at"] = datetime.utcnow().isoformat()
        
        await self.config_collection.update_one(
            {"user_id": user_id},
            {"$set": {"columns": config["columns"], "updated_at": config["updated_at"]}}
        )
        
        return KanbanColumnResponse(
            id=column["id"],
            name=column["name"],
            gmail_label_id=column["gmail_label_id"],
            gmail_label_name=column["gmail_label_name"],
            order=column["order"]
        )
    
    async def delete_column(self, user_id: str, column_id: str) -> Dict[str, Any]:
        """Delete a Kanban column."""
        config = await self.config_collection.find_one({"user_id": user_id})
        
        if not config:
            raise ValueError("Kanban config not found")
        
        # Find column
        column = None
        for col in config["columns"]:
            if col["id"] == column_id:
                column = col
                break
        
        if not column:
            raise ValueError(f"Column {column_id} not found")
        
        # Check if column has emails (prevent deletion if it does)
        try:
            service = await self.get_gmail_service(user_id)
            results = service.users().messages().list(
                userId='me',
                labelIds=[column["gmail_label_id"]],
                maxResults=1
            ).execute()
            
            if results.get('messages'):
                raise ValueError(
                    f"Cannot delete column '{column['name']}': it contains emails. "
                    "Please move or delete emails first."
                )
        except ValueError:
            raise
        except Exception as e:
            logger.warning(f"Error checking emails in column: {e}")
            # Continue with deletion if check fails
        
        # Remove column
        config["columns"] = [col for col in config["columns"] if col["id"] != column_id]
        config["updated_at"] = datetime.utcnow().isoformat()
        
        await self.config_collection.update_one(
            {"user_id": user_id},
            {"$set": {"columns": config["columns"], "updated_at": config["updated_at"]}}
        )
        
        return {"success": True, "message": f"Column '{column['name']}' deleted"}
    
    async def move_card(self, user_id: str, request: MoveCardRequest) -> Dict[str, Any]:
        """Move an email card between columns and sync Gmail labels."""
        config = await self.config_collection.find_one({"user_id": user_id})
        
        if not config:
            raise ValueError("Kanban config not found")
        
        # Find source and destination columns
        from_column = None
        to_column = None
        
        for col in config["columns"]:
            if col["id"] == request.from_column_id:
                from_column = col
            if col["id"] == request.to_column_id:
                to_column = col
        
        if not from_column:
            raise ValueError(f"Source column {request.from_column_id} not found")
        if not to_column:
            raise ValueError(f"Destination column {request.to_column_id} not found")
        
        # Get all Kanban column label IDs to remove
        kanban_label_ids = [col["gmail_label_id"] for col in config["columns"]]
        
        # Use MailService to modify email with label name
        # modify_email will handle removing other Kanban labels automatically
        updates = {
            "labels": [to_column["gmail_label_name"]]
        }
        
        # Call modify_email which handles Gmail API sync
        await self.mail_service.modify_email(user_id, request.email_id, updates)
        
        return {
            "success": True,
            "message": f"Email moved from '{from_column['name']}' to '{to_column['name']}'"
        }

