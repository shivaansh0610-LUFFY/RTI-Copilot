# RTI Copilot

RTI Copilot is an AI-powered assistant that helps Indian citizens exercise their
**Right to Information (RTI) Act, 2005** rights. It guides a user through
identifying the correct public authority, drafting a legally sound RTI
application, and tracking the request through to a response — lowering the
barrier for citizens who find the current filing process (via
[rtionline.gov.in](https://rtionline.gov.in) or state portals) confusing or
time-consuming.

## Why this project

The RTI Act empowers any Indian citizen to request information from central
and state government bodies. In practice, applicants struggle with:

- Identifying the correct **Public Information Officer (PIO)** / department
  for their query.
- Writing a request that is specific enough to get a useful answer, within
  the 3,000-character limit enforced on the online portal.
- Tracking statutory deadlines (a PIO must respond within 30 days, after
  which a first appeal can be filed).
- Understanding fees and payment steps (typically ₹10 via net banking).

RTI Copilot aims to remove this friction with an AI assistant that drafts
applications, explains the process in plain language, and keeps the
applicant informed of next steps and deadlines.

## Project Track & OJT Agenda

This repository documents the work completed under the **On-the-Job
Training (OJT)** program, aligned to the assigned Project Track: building an
AI copilot for RTI request drafting and filing assistance.

## Milestone: Month 1 (Week 1 & Week 2)

### Week 1 — Research & Requirement Gathering

- Studied the RTI Act, 2005 and the end-to-end online filing process
  (application drafting, fee payment, PIO/appellate authority structure,
  30-day response timeline, first appeal process).
- Reviewed existing RTI filing portals (`rtionline.gov.in` and state-level
  portals) to understand current UX gaps and constraints (e.g. the
  3,000-character application limit).
- Defined the problem statement and target user persona for RTI Copilot.
- Gathered functional requirements: application drafting assistance,
  authority/department lookup, deadline tracking, and status updates.
- Set up the project repository and OJT documentation workflow.

### Week 2 — Planning & Initial Development

- Finalized the high-level system design and chosen tech stack for the
  copilot (conversational drafting flow + backend for storing/tracking
  requests).
- Broke down the project into core modules: **Application Drafting
  Assistant**, **Authority Lookup**, and **Request Tracker**.
- Began implementation of the initial project scaffold and core drafting
  workflow.
- Drafted the first version of the RTI application template logic, based on
  the prescribed RTI request format and character limits.
- Identified follow-up items for Month 2: fee/payment guidance, appeal
  workflow, and response tracking.

## Status

🚧 Early-stage / Month 1 of OJT — architecture and core drafting flow in
progress. This README will be updated as further milestones are completed.

## References

- [Right to Information portal](https://rti.gov.in/)
- [RTI Online — Frequently Asked Questions](https://rtionline.gov.in/faq.php)
- [How to File RTI Online: A Comprehensive Guide](https://lawbhoomi.com/how-to-file-rti-online/)
