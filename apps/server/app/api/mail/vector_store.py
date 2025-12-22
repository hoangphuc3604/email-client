from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import chromadb
import chromadb.config
from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection

from app.config import settings


class ChromaVectorStore:
    def __init__(self, client: ClientAPI, collection_name: str = "emails"):
        self.client = client
        self.collection = self._get_or_create_collection(collection_name)

    def _get_or_create_collection(self, name: str) -> Collection:
        return self.client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )

    def upsert(
        self,
        user_id: str,
        items: Sequence[Dict],
    ) -> None:
        if not items:
            return
        ids: List[str] = []
        embeddings: List[List[float]] = []
        metadatas: List[Dict] = []
        for item in items:
            message_id = item["message_id"]
            embedding = item["embedding"]
            metadata = item.get("metadata", {})
            ids.append(f"{user_id}:{message_id}")
            embeddings.append(embedding)
            meta = dict(metadata)
            meta["user_id"] = user_id
            meta["message_id"] = message_id
            metadatas.append(meta)
        self.collection.upsert(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    def query(
        self,
        user_id: str,
        query_embedding: List[float],
        top_k: int,
        mailbox_label_id: Optional[str] = None,
    ) -> List[Tuple[str, float, Dict]]:
        # Note: We cannot filter by label here because ChromaDB (in this version)
        # does not support substring matching ($contains) on string metadata,
        # and we are storing labels as a concatenated string.
        # We will filter by user_id here and filter by label in the service layer.
        where: Dict = {"user_id": {"$eq": user_id}}
        
        # Request more results to account for post-filtering
        effective_k = top_k * 5 if mailbox_label_id else top_k
        
        result = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=effective_k,
            where=where,
        )
        ids = (result.get("ids") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        scored: List[Tuple[str, float, Dict]] = []
        for _id, distance, metadata in zip(ids, distances, metadatas):
            message_id = str(metadata.get("message_id"))
            score = 1.0 - float(distance) if distance is not None else 0.0
            scored.append((message_id, score, metadata or {}))
        return scored

    def count(self, user_id: Optional[str] = None) -> int:
        if user_id:
            result = self.collection.get(where={"user_id": user_id}, include=[])
            return len(result["ids"])
        return int(self.collection.count())


_client: Optional[ClientAPI] = None
_store: Optional[ChromaVectorStore] = None


def get_chroma_client() -> ClientAPI:
    global _client
    if _client is None:
        path = getattr(settings, "VECTOR_DB_PATH", "chroma_data")
        _client = chromadb.PersistentClient(
            path=path,
            settings=chromadb.config.Settings(anonymized_telemetry=False)
        )
    return _client


def get_vector_store() -> ChromaVectorStore:
    global _store
    if _store is None:
        _store = ChromaVectorStore(get_chroma_client())
    return _store


