from enum import Enum
from typing import Generic, TypeVar, Optional

from pydantic import BaseModel

T = TypeVar("T")


class SortDirection(str, Enum):
    ASCENDING = "asc"
    DESCENDING = "desc"


class APIResponse(BaseModel, Generic[T]):
    message: str = ""
    data: Optional[T] = None


class APIResponseWithPagination(APIResponse[T], Generic[T]):
    page: Optional[int] = None
    limit: Optional[int] = None
    sort: Optional[SortDirection] = None
    total: Optional[int] = None
    has_next: Optional[bool] = None


class APIErrorResponse(APIResponse):
    error: Optional[str] = None
    trace: Optional[str] = None

