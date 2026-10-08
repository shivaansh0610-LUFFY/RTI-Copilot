"""Thin wrapper around the Groq API (free tier, OpenAI-compatible) for
structured JSON generation.

Keeping this as one function means swapping providers later touches only this
file, not the callers in app/services/drafting.
"""

import json
import re
from functools import lru_cache

from groq import Groq

from app.config import get_settings

# Free on Groq's free tier as of this writing; no credit card required.
DEFAULT_MODEL = "openai/gpt-oss-120b"

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


@lru_cache
def _client() -> Groq:
    return Groq(api_key=get_settings().llm_api_key)


def complete_json(system: str, user: str, *, max_tokens: int = 2000) -> list | dict:
    """Send a prompt and parse the reply as JSON.

    Raises ValueError if the model didn't return parseable JSON, so callers can
    decide how to handle that (e.g. fall back to a safe default) instead of this
    wrapper deciding for them.
    """
    settings = get_settings()
    response = _client().chat.completions.create(
        model=settings.llm_model or DEFAULT_MODEL,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    text = response.choices[0].message.content or ""
    cleaned = _FENCE_RE.sub("", text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {text!r}") from exc
