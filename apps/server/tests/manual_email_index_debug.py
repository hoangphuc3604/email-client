import asyncio
from typing import List, Dict, Any

from pymongo import AsyncMongoClient

from app.config import Settings


async def run_debug(user_id: str, query: str) -> None:
    settings = Settings()
    client = AsyncMongoClient(settings.DB_CONNECTION_STRING)
    try:
        db = client[settings.DB_NAME]
        collection = db["email_index"]

        user_docs_count = await collection.count_documents({"user_id": user_id})
        print(f"user_id={user_id} count_documents={user_docs_count}")

        match_only_pipeline: List[Dict[str, Any]] = [
            {"$match": {"user_id": user_id}},
            {"$limit": 5},
        ]
        match_only_cursor = await collection.aggregate(match_only_pipeline)
        match_only_results = await match_only_cursor.to_list(length=5)
        print(f"$match user_id only -> {len(match_only_results)} results")
        for doc in match_only_results:
            print(f"  match result subject={doc.get('subject')} user_id={doc.get('user_id')}")

        autocomplete_no_filter: List[Dict[str, Any]] = [
            {
                "$search": {
                    "index": "emails_fuzzy",
                    "autocomplete": {
                        "path": "subject",
                        "query": query,
                        "fuzzy": {"maxEdits": 2, "prefixLength": 1},
                    },
                }
            },
            {"$limit": 5},
            {"$project": {"user_id": 1, "subject": 1, "score": {"$meta": "searchScore"}}},
        ]
        auto_no_filter_cursor = await collection.aggregate(autocomplete_no_filter)
        auto_no_filter_results = await auto_no_filter_cursor.to_list(length=5)
        print(f"$search autocomplete without filter -> {len(auto_no_filter_results)} results")
        for doc in auto_no_filter_results:
            print(f"  auto no filter subject={doc.get('subject')} user_id={doc.get('user_id')}")

        autocomplete_with_filter: List[Dict[str, Any]] = [
            {
                "$search": {
                    "index": "emails_fuzzy",
                    "autocomplete": {
                        "path": "subject",
                        "query": query,
                        "fuzzy": {"maxEdits": 2, "prefixLength": 1},
                    },
                }
            },
            {"$match": {"user_id": user_id}},
            {"$limit": 5},
            {"$project": {"user_id": 1, "subject": 1, "score": {"$meta": "searchScore"}}},
        ]
        auto_with_filter_cursor = await collection.aggregate(autocomplete_with_filter)
        auto_with_filter_results = await auto_with_filter_cursor.to_list(length=5)
        print(f"$search autocomplete + $match user_id -> {len(auto_with_filter_results)} results")
        for doc in auto_with_filter_results:
            print(f"  auto with filter subject={doc.get('subject')} user_id={doc.get('user_id')}")
    finally:
        await client.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python -m tests.manual_email_index_debug <user_id> <query>")
        raise SystemExit(1)

    asyncio.run(run_debug(sys.argv[1], sys.argv[2]))


