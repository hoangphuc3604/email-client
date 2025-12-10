from typing import Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings


DEFAULT_MODEL = "gemini-2.5-flash"
MAX_INPUT_CHARS = 8000  # guardrail to avoid huge payloads


class Summarizer:
    """Simple on-demand summarizer using Gemini via LangChain."""

    def __init__(self, model_name: Optional[str] = None):
        api_key = settings.GEMINI_API_KEY
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not configured")

        self.model = ChatGoogleGenerativeAI(
            model=model_name or settings.GEMINI_MODEL or DEFAULT_MODEL,
            temperature=0.3,
            max_output_tokens=256,
            google_api_key=api_key,
            timeout=20,
        )

    async def summarize(self, text: str, context: Optional[str] = None) -> str:
        """Return a short summary of the given text. Fails soft if input is empty."""
        if not text:
            return ""

        trimmed = text[:MAX_INPUT_CHARS]

        system_prompt = (
            "You are an assistant that produces crisp, 2-4 sentence summaries of emails. "
            "Keep key senders, intent, dates or action items when present. "
            "Be concise and avoid fluff."
        )
        if context:
            system_prompt += f" Context: {context}"

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Summarize this email:\n\n{trimmed}"),
        ]

        resp = await self.model.ainvoke(messages)
        return resp.content if hasattr(resp, "content") else str(resp)

