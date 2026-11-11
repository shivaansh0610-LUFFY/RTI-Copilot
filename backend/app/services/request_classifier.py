"""Tells apart two kinds of information request this app sees:

* A status request asks how an existing complaint/grievance is progressing (the PGC cause
  list in data/live_sources.csv can sometimes answer this, live, right now).
* A records request asks for a specific document or figure (a work order, a spending
  figure, an inspection report) — the kind app.services.drafting.real.decompose_grievance
  always produces. Nothing live publishes these; they come from the static corpus or, if
  not found there, from filing the RTI itself.

Citizens can also add their own custom request (see RequestsStep's "Add your own request"
in the frontend), which is the main place a status request actually shows up today.
"""

import re

# Outcome/progress words only -- "complaint" and "grievance" on their own are deliberately
# excluded. A title like "Grievance redressal mechanism for works" is a question about PWD's
# published procedure (it genuinely lives in the static corpus, e.g. CPWD Works Manual 6.16),
# not about the progress of one citizen's specific case; counting the bare noun was sending
# it down the live-status path instead, where it could never be found.
STATUS_KEYWORDS = {
    "status",
    "statuses",
    "resolved",
    "resolution",
    "disposed",
    "disposal",
    "pending",
    "hearing",
}
# Still catches "what happened to my complaint" even without one of the words above.
_MY_CASE = re.compile(r"\bmy\s+(complaint|grievance)s?\b", re.IGNORECASE)


def is_status_request(title: str) -> bool:
    words = {word.strip(".,()?!:;\"'").lower() for word in title.split()}
    return bool(words & STATUS_KEYWORDS) or bool(_MY_CASE.search(title))
