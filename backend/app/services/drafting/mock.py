"""Mock drafting logic, identical to src/components/rti-drafting-wizard/mocks.ts.

Each function is replaced by the real implementation in this package; keep the
signatures so the routers don't change.
"""

from app.schemas import InformationRequest, PublicSource

DEFAULT_AUTHORITY = "Public Works Department (PWD), Ward Division Office"


def decompose_grievance(
    _grievance: str, clarification: dict[str, str]
) -> list[InformationRequest]:
    period = clarification.get("period", "Last 1 year")
    return [
        InformationRequest(
            id="RQ-001",
            category="Work order",
            title="Copy of the work order sanctioning repair of the road",
            authority=DEFAULT_AUTHORITY,
            period=period,
            quality="good",
            source="generated",
        ),
        InformationRequest(
            id="RQ-002",
            category="Expenditure",
            title="Details of amount spent",
            authority=DEFAULT_AUTHORITY,
            period=period,
            quality="needs-detail",
            source="generated",
        ),
        InformationRequest(
            id="RQ-003",
            category="Inspection report",
            title="Copy of the most recent inspection/quality-check report for the road",
            authority=DEFAULT_AUTHORITY,
            period=period,
            quality="good",
            source="generated",
        ),
    ]


def check_public_info(requests: list[InformationRequest]) -> list[InformationRequest]:
    checked = []
    for request in requests:
        if request.id == "RQ-001":
            update = {
                "publicly_available": True,
                "public_source": PublicSource(
                    title="Central Public Procurement Portal — awarded tenders & work orders",
                    url="https://eprocure.gov.in/cppp/",
                ),
            }
        else:
            update = {"publicly_available": False, "public_source": None}
        checked.append(request.model_copy(update=update))
    return checked


def generate_draft(requests: list[InformationRequest]) -> str:
    sections = []
    for request in requests:
        background = f"Background: {request.context}\n" if request.context else ""
        sections.append(
            f'Subject: Request for information regarding "{request.title}"\n'
            f"Authority: {request.authority}\n"
            f"Particulars of information sought: {request.title}\n"
            f"Period: {request.period}\n"
            f"{background}"
        )
    return "\n---\n\n".join(sections)
