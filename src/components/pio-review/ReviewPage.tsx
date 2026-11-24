import { useState } from "react";
import { PageContainer, PageHeader } from "../layout/Layout";
import { Sheet } from "../layout/Paper";
import { REVIEW_LIMIT } from "./api";
import PioReview from "./PioReview";

const PORTAL_LIMIT = 3000;

// For an application written anywhere: paste it on the sheet, check it like a PIO beside it,
// use the improved version.
export default function ReviewPage() {
  const [text, setText] = useState("");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Check a draft · PIO review"
        title="Check it like a PIO"
        accent="PIO"
        intro="Paste an RTI application, written here or anywhere else. RTI Copilot reads it like a reluctant Public Information Officer, scores it out of 10, and suggests a safer version."
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-x-11">
        {/* The pasted text stays in view while the notes beside it are read. */}
        <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-24">
          <Sheet
            label={<label htmlFor="review-text">Your application</label>}
            className="px-5 pb-8 pt-12 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-ink-blue/50 sm:px-10 sm:pb-10 sm:pt-14"
          >
            <textarea
              id="review-text"
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, REVIEW_LIMIT))}
              rows={16}
              placeholder={"I hereby request information under Section 6(1) of the Right to Information Act, 2005.\n1. ..."}
              className="block min-h-[22rem] w-full resize-y border-0 bg-transparent p-0 font-serif text-[15px] leading-[1.75] text-ink outline-none placeholder:text-faint"
            />
          </Sheet>
          <p className={"text-right text-xs " + (text.length > PORTAL_LIMIT ? "font-medium text-[#8a4b08]" : "text-muted")}>
            {text.length.toLocaleString()} / {PORTAL_LIMIT.toLocaleString()} characters (the online portal's limit)
          </p>
        </div>
        <div className="min-w-0">
          <PioReview text={text} onUse={setText} />
        </div>
      </div>
    </PageContainer>
  );
}
