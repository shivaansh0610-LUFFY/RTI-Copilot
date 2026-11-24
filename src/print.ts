import type { ApplicantDetails, DraftLanguage } from "./types";

// The "text of application" box on the online RTI portal already sits inside a form that
// collects the applicant's name, address and fee separately -- draft.draftText is written for
// exactly that box, nothing more (see DRAFT_SYSTEM_PROMPT in the backend). Posting a letter
// instead has no such form around it, so the printed copy needs the surrounding letter itself:
// the addressee, the "Sir/Madam" opening, the applicant's own particulars (filled in from the
// "Your details" step when given, left blank otherwise as every official sample RTI form does)
// and a signature block. Modelled on the Government of India's own sample RTI application form
// (e.g. niphtr.mohfw.gov.in).
// The centred title every official sample RTI form opens with (e.g. "APPLICATION FORM UNDER
// RIGHT TO INFORMATION ACT 2005" / "SAMPLE RTI APPLICATION FORM"), rendered above the letter.
const POSTAL_HEADING: Record<DraftLanguage, string> = {
  en: "Application under the Right to Information Act, 2005",
  hi: "सूचना के अधिकार अधिनियम, 2005 के अंतर्गत आवेदन",
};

const BLANK_NAME = "________________________________";
const BLANK_ADDRESS = "________________________________________________________________";
const BLANK_PHONE = "________________________";

const RELATION_LABEL: Record<DraftLanguage, Record<ApplicantDetails["relation"], string>> = {
  en: { son: "Son", daughter: "Daughter", wife: "Wife" },
  hi: { son: "पुत्र", daughter: "पुत्री", wife: "पत्नी" },
};

// Both fields are optional, so only mention the one(s) actually given -- never a blank line for
// a field nobody asked to leave blank. With neither given (or no applicant yet), both stay as
// blanks for the citizen to fill in by hand, as the official sample form does.
function contactLine(applicant: ApplicantDetails | undefined, language: DraftLanguage): string {
  const phone = applicant?.phone?.trim();
  const mobile = applicant?.mobile?.trim();
  const label =
    language === "hi"
      ? { phone: "दूरभाष संख्या", mobile: "मोबाइल नंबर", and: "और/अथवा" }
      : { phone: "telephone number", mobile: "mobile number", and: "and/or" };
  if (phone && mobile) return `${label.phone} ${phone} ${label.and} ${label.mobile} ${mobile}`;
  if (phone) return `${label.phone} ${phone}`;
  if (mobile) return `${label.mobile} ${mobile}`;
  return `${label.phone} ${BLANK_PHONE} ${label.and} ${label.mobile} ${BLANK_PHONE}`;
}

// Today, in the format an Indian official letter uses -- filled in automatically rather than
// left as a blank for the citizen to date by hand.
function todayLine(language: DraftLanguage): string {
  const locale = language === "hi" ? "hi-IN" : "en-IN";
  return new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

const POSTAL_LETTER: Record<
  DraftLanguage,
  (body: string, authority: string, applicant?: ApplicantDetails) => string
> = {
  en: (body, authority, applicant) => `To,
The Public Information Officer,
${authority}

Subject: Request for information under the Right to Information Act, 2005.

Sir/Madam,

I, ${applicant?.name || BLANK_NAME}, ${applicant ? RELATION_LABEL.en[applicant.relation] : "Son/Daughter/wife"} of ${applicant?.relativeName || BLANK_NAME},
resident of ${applicant?.address || BLANK_ADDRESS},
${contactLine(applicant, "en")},
wish to seek the following information under Section 6(1) of the Right to Information Act, 2005:

${body}

I am enclosing the application fee of Rs. 10 by cash / postal order / demand draft, as prescribed.
I am a citizen of India and am asking for this information as a citizen.

Yours faithfully,

(Signature)
Name: ${applicant?.name ?? ""}
Address: ${applicant?.address ?? ""}
Date: ${todayLine("en")}`,
  hi: (body, authority, applicant) => `सेवा में,
जन सूचना अधिकारी,
${authority}

विषय: सूचना का अधिकार अधिनियम, 2005 के अंतर्गत सूचना हेतु आवेदन।

महोदय/महोदया,

मैं, ${applicant?.name || BLANK_NAME}, ${applicant ? RELATION_LABEL.hi[applicant.relation] : "पुत्र/पुत्री/पत्नी"} ${applicant?.relativeName || BLANK_NAME},
निवासी ${applicant?.address || BLANK_ADDRESS},
${contactLine(applicant, "hi")},
सूचना का अधिकार अधिनियम, 2005 की धारा 6(1) के अंतर्गत निम्नलिखित सूचना चाहता/चाहती हूँ:

${body}

मैं निर्धारित आवेदन शुल्क रु. 10 नकद/पोस्टल ऑर्डर/डिमांड ड्राफ्ट द्वारा संलग्न कर रहा/रही हूँ।
मैं भारत का नागरिक हूँ और नागरिक के रूप में यह सूचना माँग रहा/रही हूँ।

भवदीय,

(हस्ताक्षर)
नाम: ${applicant?.name ?? ""}
पता: ${applicant?.address ?? ""}
दिनांक: ${todayLine("hi")}`,
};

export function postalLetterHeading(language: DraftLanguage): string {
  return POSTAL_HEADING[language];
}

export function postalLetterText(
  body: string,
  authority: string,
  language: DraftLanguage,
  applicant?: ApplicantDetails,
): string {
  return POSTAL_LETTER[language](body, authority, applicant);
}

const ESCAPE = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PRINT_STYLE = `
  body { font: 12pt/1.5 "Noto Sans", "Noto Sans Devanagari", Arial, sans-serif; margin: 2cm; color: #000; }
  h1 { font-size: 13pt; text-align: center; margin: 0 0 1.5em; }
  pre { white-space: pre-wrap; font: inherit; margin: 0; }
  .enclosure { max-width: 100%; max-height: 24cm; display: block; margin: 1.5cm auto 0; page-break-before: always; }
`;

function printPage(title: string, text: string, heading: string | undefined, images: string): boolean {
  const page = window.open("", "_blank");
  if (!page) return false;
  const headingHtml = heading ? `<h1>${ESCAPE(heading)}</h1>` : "";
  page.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${ESCAPE(title)}</title>
<style>${PRINT_STYLE}</style>
</head>
<body>${headingHtml}<pre>${ESCAPE(text)}</pre>${images}</body>
</html>`);
  page.document.close();
  page.focus();
  page.print();
  return true;
}

// Opens `text` alone on a clean page and the browser's print dialog, where "Save as PDF" makes
// the file to attach or the copy to post. `heading` is an optional centred title above the text
// (e.g. postalLetterHeading()). Returns false if the browser blocked the new window.
export function printText(title: string, text: string, heading?: string): boolean {
  return printPage(title, text, heading, "");
}

// Same as printText, with each photo on its own page after the text -- for printing or saving
// the application together with its enclosures. The photos stay local: an object URL only the
// browser resolves, never a server upload.
export function printTextWithPhotos(title: string, text: string, photos: File[], heading?: string): boolean {
  const images = photos
    .map((photo) => `<img class="enclosure" src="${URL.createObjectURL(photo)}" alt="">`)
    .join("\n");
  return printPage(title, text, heading, images);
}
