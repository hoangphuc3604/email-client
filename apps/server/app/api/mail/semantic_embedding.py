from typing import Iterable, List
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from app.config import settings

MODEL_NAME = "models/text-embedding-004"

def _get_model() -> GoogleGenerativeAIEmbeddings:
    return GoogleGenerativeAIEmbeddings(
        model=MODEL_NAME,
        google_api_key=settings.GEMINI_API_KEY
    )

def encode_texts(texts: Iterable[str], batch_size: int = 16) -> List[List[float]]:
    data = list(texts)
    if not data:
        return []
    model = _get_model()
    embeddings = model.embed_documents(data)
    return embeddings

def embedding_dimension() -> int:
    return 768


