from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from uuid import uuid4

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from app.api.mail.semantic_embedding import embedding_dimension
from app.config import settings


class QdrantVectorStore:
    """Lightweight wrapper around Qdrant Cloud for semantic email search."""

    def __init__(self, client: QdrantClient, collection_name: str = "emails"):
        self.client = client
        self.collection_name = collection_name
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        dim = embedding_dimension()
        try:
            self.client.get_collection(self.collection_name)
        except Exception:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=qm.VectorParams(
                    size=dim,
                    distance=qm.Distance.COSINE,
                ),
            )
        # Ensure payload indexes for filters we use
        for field in ("user_id", "labels"):
            try:
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field,
                    field_schema=qm.PayloadSchemaType.KEYWORD,
                )
            except Exception:
                # Index may already exist; ignore errors to keep idempotent
                pass

    def upsert(
        self,
        user_id: str,
        items: Sequence[Dict],
    ) -> None:
        if not items:
            return
        points: List[qm.PointStruct] = []
        for item in items:
            message_id = item["message_id"]
            embedding = item["embedding"]
            metadata = item.get("metadata", {})
            labels = metadata.get("labels") or item.get("labels") or []
            payload = {
                **metadata,
                "user_id": user_id,
                "message_id": message_id,
                "labels": labels,
            }
            points.append(
                qm.PointStruct(
                    id=str(uuid4()),  # let Qdrant use a valid UUID
                    vector=embedding,
                    payload=payload,
                )
            )
        self.client.upsert(collection_name=self.collection_name, points=points)

    def query(
        self,
        user_id: str,
        query_embedding: List[float],
        top_k: int,
        mailbox_label_id: Optional[str] = None,
    ) -> List[Tuple[str, float, Dict]]:
        must = [
            qm.FieldCondition(
                key="user_id",
                match=qm.MatchValue(value=user_id),
            )
        ]
        if mailbox_label_id:
            must.append(
                qm.FieldCondition(
                    key="labels",
                    match=qm.MatchAny(any=[mailbox_label_id]),
                )
            )

        res = self.client.query_points(
            collection_name=self.collection_name,
            query=query_embedding,
            limit=top_k,
            with_payload=True,
            with_vectors=False,
            query_filter=qm.Filter(must=must),
        )
        scored: List[Tuple[str, float, Dict]] = []
        for point in res.points:
            payload = point.payload or {}
            message_id = str(payload.get("message_id"))
            score = float(point.score) if point.score is not None else 0.0
            scored.append((message_id, score, payload))
        return scored

    def count(self, user_id: Optional[str] = None) -> int:
        if user_id:
            res = self.client.count(
                collection_name=self.collection_name,
                count_filter=qm.Filter(
                    must=[
                        qm.FieldCondition(
                            key="user_id",
                            match=qm.MatchValue(value=user_id),
                        )
                    ]
                ),
                exact=True,
            )
            return int(res.count or 0)
        res = self.client.count(
            collection_name=self.collection_name,
            exact=True,
        )
        return int(res.count or 0)


_client: Optional[QdrantClient] = None
_store: Optional[QdrantVectorStore] = None


def get_qdrant_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=getattr(settings, "QDRANT_API_KEY", None) or None,
            timeout=20,
        )
    return _client


def get_vector_store() -> QdrantVectorStore:
    global _store
    if _store is None:
        _store = QdrantVectorStore(
            client=get_qdrant_client(),
            collection_name=getattr(settings, "QDRANT_COLLECTION", "emails") or "emails",
        )
    return _store
