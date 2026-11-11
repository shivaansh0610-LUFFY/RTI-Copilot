"""Write demo/sample-pio-reply.pdf: a made-up PIO reply for demonstrating the reply analysis.

It is labelled as a sample on the page itself. Its five points are written to produce five
different findings: an annexure, "not maintained", a fee demand, a Section 8 exemption and a
Section 6(3) transfer. Run from the repo root:

    backend/.venv/bin/python demo/make_sample_reply.py
"""

import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "tests"))
sys.path.insert(0, str(ROOT / "backend"))

from corpus_support import make_pdf  # noqa: E402  (a minimal PDF writer, test helper)

WIDTH = 88

PARAGRAPHS = [
    "SAMPLE REPLY - made up for demonstrating RTI Copilot. Not a real government document.",
    "",
    "Government of NCT of Delhi, Public Works Department, Maintenance Division",
    "To: The Applicant",
    "Subject: Reply to your application under the RTI Act, 2005 regarding Ring Road, Lajpat Nagar",
    "",
    "Sir/Madam, with reference to your application, the point-wise reply is as under:",
    "",
    "1. A copy of the work order for the repair of the Ring Road stretch near Lajpat Nagar "
    "is enclosed as Annexure-A.",
    "2. The information regarding the amount spent is not maintained in the form sought by "
    "the applicant.",
    "3. Copies of the Measurement Book entries (23 pages) can be supplied on deposit of an "
    "additional fee of Rs. 46 at Rs. 2 per page.",
    "4. The inspection and quality-check reports are exempt from disclosure under Section "
    "8(1)(d) of the RTI Act, 2005, as they contain commercial information of the contractor.",
    "5. Your request concerning the defect liability of the contractor has been transferred "
    "to the Executive Engineer, Maintenance Division M-42, under Section 6(3) of the Act.",
    "",
    "If you are not satisfied with this reply, you may file a first appeal before the First "
    "Appellate Authority within 30 days of receiving it.",
    "",
    "Public Information Officer, PWD Maintenance Division",
]


def lines() -> list[str]:
    wrapped: list[str] = []
    for paragraph in PARAGRAPHS:
        # A blank line in the PDF text keeps paragraphs apart when the reply is read back.
        wrapped.extend(textwrap.wrap(paragraph, WIDTH) or [""])
    return wrapped


if __name__ == "__main__":
    out = ROOT / "demo" / "sample-pio-reply.pdf"
    out.write_bytes(make_pdf([lines()]))
    print(f"wrote {out.relative_to(ROOT)}")
