"""Flags request titles that are still too vague to send as-is.

Applied at draft time (not just at decompose time) because the citizen may have
edited a title in the Quality Review step, so the original LLM-assigned
`quality` on the request can be stale.
"""

MIN_WORDS = 6  # matches the threshold used for citizen-authored requests in the frontend


def is_vague(title: str) -> bool:
    return len(title.split()) < MIN_WORDS
