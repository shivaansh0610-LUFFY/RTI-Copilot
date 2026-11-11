import { useState } from "react";
import RtiDraftingWizard from "./components/rti-drafting-wizard";
import ResponseAnalysisWizard from "./components/response-analysis-wizard";
import type { FiledCase, FollowUpContext } from "./types";

type Preview = "drafting" | "analysis";

function App() {
  const [preview, setPreview] = useState<Preview>("drafting");
  const [followUp, setFollowUp] = useState<FollowUpContext | undefined>();
  const [draftingKey, setDraftingKey] = useState(0);
  // The application drafted last, so its reply can be analysed against its own requests.
  const [filedCase, setFiledCase] = useState<FiledCase | undefined>();
  const [analysisKey, setAnalysisKey] = useState(0);

  function handleFileFollowUp(context: FollowUpContext) {
    setFollowUp(context);
    setDraftingKey((k) => k + 1);
    setPreview("drafting");
  }

  function handleDraftReady(drafted: FiledCase) {
    setFiledCase(drafted);
    // A new draft means a new reply to analyse: start that wizard afresh.
    setAnalysisKey((k) => k + 1);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex justify-center gap-2 border-b border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={() => {
            // Opening the tab directly starts a fresh application, not a follow-up. (An
            // ordinary draft in progress is kept: the wizard stays mounted while hidden.)
            if (preview !== "drafting" && followUp) {
              setFollowUp(undefined);
              setDraftingKey((k) => k + 1);
            }
            setPreview("drafting");
          }}
          className={
            "rounded-md px-3 py-1.5 text-sm font-medium " +
            (preview === "drafting" ? "bg-slate-900 text-white" : "text-slate-600")
          }
        >
          1. Draft your RTI
        </button>
        <button
          type="button"
          onClick={() => setPreview("analysis")}
          className={
            "rounded-md px-3 py-1.5 text-sm font-medium " +
            (preview === "analysis" ? "bg-slate-900 text-white" : "text-slate-600")
          }
        >
          2. Analyse the reply
        </button>
      </div>

      {/* Both stay mounted so switching tabs never loses a draft or an analysis in progress. */}
      <div hidden={preview !== "drafting"}>
        <RtiDraftingWizard
          key={draftingKey}
          followUp={followUp}
          onDraftReady={handleDraftReady}
          onAnalyseReply={() => setPreview("analysis")}
        />
      </div>
      <div hidden={preview !== "analysis"}>
        <ResponseAnalysisWizard
          key={analysisKey}
          filedCase={filedCase}
          onFileFollowUp={handleFileFollowUp}
        />
      </div>
    </div>
  );
}

export default App;
