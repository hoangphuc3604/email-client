from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app import config


@lru_cache
def get_settings():
    return config.Settings()


async def get_db(settings: config.Settings = Depends(get_settings)) -> AsyncDatabase:
    client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
    db = client[settings.DB_NAME]
    try:
        yield db
    finally:
        await client.close()

