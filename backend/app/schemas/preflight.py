from app.schemas.base import ApiModel

# Mirrors PreflightResult in src/types.ts. Change both together.


class PreflightIssue(ApiModel):
    code: str  # a key of app.services.preflight.EXCUSES
    officer_says: str
    why: str
    section: str  # e.g. "Section 2(f)"
    fix: str


class PreflightItem(ApiModel):
    request_id: str
    issues: list[PreflightIssue] = []
    # A better title from the AI, only when there are issues and it passed the checks.
    suggested_title: str | None = None


class PreflightResult(ApiModel):
    items: list[PreflightItem]
    # False when only the fixed rules ran (AI drafting off, or the model call failed).
    ai_used: bool
