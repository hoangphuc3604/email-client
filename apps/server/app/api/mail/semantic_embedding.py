from functools import lru_cache
from typing import Iterable, List

import numpy as np
from sentence_transformers import SentenceTransformer


MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    return SentenceTransformer(MODEL_NAME, trust_remote_code=False)


def encode_texts(texts: Iterable[str], batch_size: int = 32) -> List[List[float]]:
    data = list(texts)
    if not data:
        return []
    model = _get_model()
    embeddings = model.encode(
        data,
        batch_size=batch_size,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    if isinstance(embeddings, np.ndarray):
        return embeddings.astype("float32").tolist()
    return [np.asarray(e, dtype="float32").tolist() for e in embeddings]


def embedding_dimension() -> int:
    model = _get_model()
    return int(model.get_sentence_embedding_dimension())


