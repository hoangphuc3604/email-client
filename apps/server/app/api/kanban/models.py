"""Pydantic models for Kanban API."""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model with camelCase aliases."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )


class KanbanColumnCreate(BaseModel):
    """Request model for creating a Kanban column."""
    name: str = Field(..., min_length=1, max_length=100)
    gmail_label_id: Optional[str] = None  # If None, create new Gmail label
    gmail_label_name: Optional[str] = None  # Name for new label
    order: int = Field(..., ge=0)


class KanbanColumnUpdate(BaseModel):
    """Request model for updating a Kanban column."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    gmail_label_id: Optional[str] = None
    gmail_label_name: Optional[str] = None
    order: Optional[int] = Field(None, ge=0)


class KanbanColumnResponse(CamelModel):
    """Response model for a Kanban column."""
    id: str
    name: str
    gmail_label_id: str
    gmail_label_name: str
    order: int


class KanbanConfigResponse(CamelModel):
    """Response model for Kanban configuration."""
    user_id: str
    columns: List[KanbanColumnResponse]


class MoveCardRequest(BaseModel):
    """Request model for moving a card between columns."""
    email_id: str
    from_column_id: str
    to_column_id: str
    index: int = Field(0, ge=0)

