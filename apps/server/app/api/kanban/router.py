"""Router for Kanban board configuration API."""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from app.api.kanban.models import (
    KanbanColumnCreate,
    KanbanColumnUpdate,
    KanbanColumnResponse,
    KanbanConfigResponse,
    MoveCardRequest
)
from app.api.kanban.service import KanbanService
from app.api.kanban.dependencies import get_kanban_service
from app.api.auth.dependencies import get_current_user
from app.api.auth.models import UserInfo
from app.models.api_response import APIResponse

router = APIRouter(prefix="/kanban", tags=["Kanban"])


@router.get("/columns", response_model=APIResponse[KanbanConfigResponse])
async def get_columns(
    kanban_service: KanbanService = Depends(get_kanban_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Get user's Kanban board configuration."""
    try:
        config = await kanban_service.get_config(current_user.id)
        return APIResponse(
            data=config,
            message="Kanban configuration retrieved successfully"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve Kanban configuration: {str(e)}"
        )


@router.post("/columns", response_model=APIResponse[KanbanColumnResponse])
async def create_column(
    column: KanbanColumnCreate,
    kanban_service: KanbanService = Depends(get_kanban_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Create a new Kanban column."""
    try:
        new_column = await kanban_service.create_column(current_user.id, column)
        return APIResponse(
            data=new_column,
            message="Column created successfully"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create column: {str(e)}"
        )


@router.put("/columns/{column_id}", response_model=APIResponse[KanbanColumnResponse])
async def update_column(
    column_id: str,
    updates: KanbanColumnUpdate,
    kanban_service: KanbanService = Depends(get_kanban_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Update a Kanban column."""
    try:
        updated_column = await kanban_service.update_column(
            current_user.id, column_id, updates
        )
        return APIResponse(
            data=updated_column,
            message="Column updated successfully"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update column: {str(e)}"
        )


@router.delete("/columns/{column_id}", response_model=APIResponse[dict])
async def delete_column(
    column_id: str,
    kanban_service: KanbanService = Depends(get_kanban_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Delete a Kanban column."""
    try:
        result = await kanban_service.delete_column(current_user.id, column_id)
        return APIResponse(
            data=result,
            message="Column deleted successfully"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete column: {str(e)}"
        )


@router.post("/move-card", response_model=APIResponse[dict])
async def move_card(
    request: MoveCardRequest,
    kanban_service: KanbanService = Depends(get_kanban_service),
    current_user: UserInfo = Depends(get_current_user)
):
    """Move an email card between columns."""
    try:
        result = await kanban_service.move_card(current_user.id, request)
        return APIResponse(
            data=result,
            message="Card moved successfully"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to move card: {str(e)}"
        )

