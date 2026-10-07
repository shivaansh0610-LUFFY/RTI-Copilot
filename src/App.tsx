import { useState } from "react";
import RtiDraftingWizard from "./components/rti-drafting-wizard";
import ResponseAnalysisWizard from "./components/response-analysis-wizard";
import type { FollowUpContext } from "./types";

type Preview = "drafting" | "analysis";

function App() {
  const [preview, setPreview] = useState<Preview>("drafting");
  const [followUp, setFollowUp] = useState<FollowUpContext | undefined>();
  const [draftingKey, setDraftingKey] = useState(0);

  function handleFileFollowUp(context: FollowUpContext) {
    setFollowUp(context);
    setDraftingKey((k) => k + 1);
    setPreview("drafting");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex justify-center gap-2 border-b border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={() => {
            // Opening the tab directly starts a fresh application, not a follow-up.
            if (preview !== "drafting") setFollowUp(undefined);
            setPreview("drafting");
          }}
          className={
            "rounded-md px-3 py-1.5 text-sm font-medium " +
            (preview === "drafting" ? "bg-slate-900 text-white" : "text-slate-600")
          }
        >
          RTI Drafting Wizard
        </button>
        <button
          type="button"
          onClick={() => setPreview("analysis")}
          className={
            "rounded-md px-3 py-1.5 text-sm font-medium " +
            (preview === "analysis" ? "bg-slate-900 text-white" : "text-slate-600")
          }
        >
          Response Analysis Wizard
        </button>
      </div>

      {preview === "drafting" ? (
        <RtiDraftingWizard key={draftingKey} followUp={followUp} />
      ) : (
        <ResponseAnalysisWizard onFileFollowUp={handleFileFollowUp} />
      )}
    </div>
  );
}

export default App;
