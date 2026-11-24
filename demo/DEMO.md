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

0. **Home page.** Scroll the story: the slideshow (each slide pairs a problem with the record
   to ask for), Right to Information, the five records (open a strip or two), then **How it
   works**: press play on the application sheet for the 30-second demo. Under the polaroids,
   the problems are only things PWD is responsible for on its roads. Click **Pothole or
   broken road**.
1. **Describe.** Replace the starter sentence with:
   > There is a big pothole on Ring Road near Lajpat Nagar metro station. It has been there
   > for about 6 months, two-wheelers fall almost every week, and nobody from PWD has repaired
   > it despite complaints.

   Add a photo: that is when the browser is asked for your location (choose Allow). The
   street name appears and a `Location:` line is added. The photo never leaves the device.
2. **Clarify.** The AI already knows the period (6 months) and the place, so it asks only
   what is missing, and which kinds of record you want (pick one or more).
3. **Requests.** Each request is a specific record, and most show **"Why ask for this"**: the
   passage of the CPWD Works Manual (or the RTI Act) that says the record must exist, with a
   link that opens the PDF at that page. *This is the GenAI core: retrieval over 4,789
   passages of official documents, cited, never invented.*
4. **Officer check.** Each request is read the way a reluctant PIO would read it. A vague one
   gets the excuse the officer could use, in red pen in the margin, with the section behind
   it; reword it and **Check again**.
5. **Your details.** Name, father's or husband's name and address, for the printed letter.
6. **Draft.** One application: Section 6(1), the location, numbered requests, a Section 6(3)
   transfer clause, with your details in the letter. Switch to **हिंदी**. Copy, or **PDF**
   (print or save as PDF, with any photos as extra pages). **Check like a PIO** scores it out of
   10 (the score lands as a rubber stamp, on the review and on the letter) and can suggest a
   safer version. Note the dates: the reply is due in 30 days, then the appeal window.
7. **Got the reply? Analyse it.** Upload `demo/sample-pio-reply.pdf` (a made-up reply,
   labelled as a sample). Each request gets a finding with the line of the reply it is based
   on: answered via an annexure, "not maintained", a fee demanded, an exemption claimed under
   Section 8, transferred. On **Findings** those lines are marked on the reply with a
   highlighter: green answered, amber partly, red refused. Where the AI cannot tell, it says
   "Insufficient evidence" rather than guessing.
8. **Draft first appeal.** Select the unanswered requests and draft the Section 19(1)
   appeal. Registration number and dates stay as [placeholders]: the app never guesses them.
9. **My RTIs.** The application is listed there. Enter today as the filing date: it shows
   "Reply due by ... (30 days left)" under a REPLY DUE date stamp, and after that the appeal
   window. It is kept in this
   browser only; nothing is sent anywhere.

## If something goes wrong

- No Groq key, or Groq is down: every step still works, using templates and saying so;
  nothing is made up.
- A request without "Why ask for this": no passage clearly supported it, so none is shown.
- A scanned reply: it is read with OCR (Hindi and English), which is slower and less exact
  than a PDF with text.

## Next steps to mention

Reminders by SMS or email when a deadline nears, other authorities (MCD, NDMC, DJB) chosen
from the location, accounts so the list follows you across devices, and deployment.
