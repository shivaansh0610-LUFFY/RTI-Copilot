import { useState } from "react";
import { PageContainer, PageHeader } from "../layout/Layout";
import { REVIEW_LIMIT } from "./api";
import PioReview from "./PioReview";

const PORTAL_LIMIT = 3000;

// For an application written anywhere: paste it, check it like a PIO, use the improved version.
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-text" className="text-sm font-medium text-slate-900">
          Your application
        </label>
        <textarea
          id="review-text"
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, REVIEW_LIMIT))}
          rows={12}
          placeholder={"I hereby request information under Section 6(1) of the Right to Information Act, 2005.\n1. ..."}
          className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-800 focus:border-slate-500 focus:outline-none"
        />
        <p className={"text-right text-xs " + (text.length > PORTAL_LIMIT ? "text-amber-700" : "text-slate-400")}>
          {text.length.toLocaleString()} / {PORTAL_LIMIT.toLocaleString()} characters (the online portal's limit)
        </p>
      </div>
      <PioReview text={text} onUse={setText} />
    </PageContainer>
  );
}
