# RTI Copilot demo

**Pitch:** when your civic complaint is ignored, RTI Copilot helps you demand the exact
records, reads the government's reply, and drafts your appeal. The AI never claims access
to government files: the citizen gets those through RTI, and the AI makes sure they ask
for the right ones and are not fobbed off.

## Before the demo (once)

1. Docker Desktop running, then `docker start rti-copilot-db` (the local database, port 54329).
2. `.env` in the repo root has `LLM_API_KEY` (Groq), `USE_LLM_DRAFTING=true` and
   `USE_CORPUS_CITATIONS=true`.
3. Backend: `cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8000`.
   Wait about 30 seconds after it starts: it loads the embedding model in the background.
4. Frontend, in another terminal at the repo root: `npm run dev`, open http://localhost:5173.

## The flow (about 5 minutes)

1. **Describe.** Paste:
   > There is a big pothole on Ring Road near Lajpat Nagar metro station. It has been there
   > for about 6 months, two-wheelers fall almost every week, and nobody from PWD has repaired
   > it despite complaints.

   Tap "Choose on map" and drop the pin near Lajpat Nagar: the street name appears and a
   `Location:` line is added. (The photo button works too; the photo never leaves the device.)
2. **Clarify.** The AI already knows the period (6 months) and the place, so it asks only
   what is missing.
3. **Requests.** Each request is a specific record, and most show **"Why ask for this"**: the
   passage of the CPWD Works Manual (or the RTI Act) that says the record must exist, with a
   link that opens the PDF at that page. *This is the GenAI core: retrieval over 4,789
   passages of official documents, cited, never invented.*
4. **Draft.** One application, ready for the portal's text box: Section 6(1), the location,
   numbered requests, a Section 6(3) transfer clause. Switch to **हिंदी**. Copy. Note the
   dates: the reply is due in 30 days, and the first-appeal window.
5. **Got the reply? Analyse it.** Upload `demo/sample-pio-reply.pdf` (a made-up reply,
   labelled as a sample). Each request gets a finding with the line of the reply it is based
   on: answered via an annexure, "not maintained", a fee demanded, an exemption claimed under
   Section 8, transferred. Where the AI cannot tell, it says "Insufficient evidence" rather
   than guessing.
6. **Draft first appeal.** Select the unanswered requests and draft the Section 19(1)
   appeal. Registration number and dates stay as [placeholders]: the app never guesses them.

## If something goes wrong

- No Groq key, or Groq is down: every step still works, using templates and saying so;
  nothing is made up.
- A request without "Why ask for this": no passage clearly supported it, so none is shown.
- A scanned reply: it is refused with a clear message (reading scans is a next step).

## Next steps to mention

A home page with common problems, "My RTIs" with deadline reminders, reading scanned
replies, other authorities (MCD, NDMC, DJB) chosen from the map pin, and deployment.
