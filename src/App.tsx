import { Scale } from "lucide-react";
import { useState } from "react";
import HomePage from "./components/home/HomePage";
import RtiDraftingWizard from "./components/rti-drafting-wizard";
import ResponseAnalysisWizard from "./components/response-analysis-wizard";
import type { FiledCase, FollowUpContext } from "./types";

type View = "home" | "drafting" | "analysis";

function App() {
  const [view, setView] = useState<View>("home");
  const [followUp, setFollowUp] = useState<FollowUpContext | undefined>();
  // A problem tile's opening sentence, for a fresh application.
  const [starter, setStarter] = useState<string | undefined>();
  const [draftingKey, setDraftingKey] = useState(0);
  // The application drafted last, so its reply can be analysed against its own requests.
  const [filedCase, setFiledCase] = useState<FiledCase | undefined>();
  const [analysisKey, setAnalysisKey] = useState(0);

  function restartDrafting(nextFollowUp?: FollowUpContext, nextStarter?: string) {
    setFollowUp(nextFollowUp);
    setStarter(nextStarter);
    setDraftingKey((k) => k + 1);
    setView("drafting");
  }

  function handleStart(tileStarter?: string) {
    // A tile starts a new application; the plain button carries on with any draft in progress.
    if (tileStarter) restartDrafting(undefined, tileStarter);
    else openDrafting();
  }

  function openDrafting() {
    // Opening drafting directly never continues a follow-up. (An ordinary draft in progress is
    // kept: the wizard stays mounted while hidden.)
    if (followUp) restartDrafting();
    else setView("drafting");
  }

  function handleDraftReady(drafted: FiledCase) {
    setFiledCase(drafted);
    // A new draft means a new reply to analyse: start that wizard afresh.
    setAnalysisKey((k) => k + 1);
  }

  const tab = (active: boolean) =>
    "rounded-md px-3 py-1.5 text-sm font-medium " + (active ? "bg-slate-900 text-white" : "text-slate-600");

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setView("home")}
          className="flex items-center gap-2 text-sm font-semibold text-slate-900"
        >
          <Scale size={16} />
          RTI Copilot
        </button>
        <div className="flex gap-1">
          <button type="button" onClick={openDrafting} className={tab(view === "drafting")}>
            1. Draft your RTI
          </button>
          <button type="button" onClick={() => setView("analysis")} className={tab(view === "analysis")}>
            2. Analyse the reply
          </button>
        </div>
      </nav>

      {view === "home" && <HomePage onStart={handleStart} onAnalyse={() => setView("analysis")} />}

      {/* Both wizards stay mounted so switching views never loses a draft or an analysis. */}
      <div hidden={view !== "drafting"}>
        <RtiDraftingWizard
          key={draftingKey}
          followUp={followUp}
          starter={starter}
          onDraftReady={handleDraftReady}
          onAnalyseReply={() => setView("analysis")}
        />
      </div>
      <div hidden={view !== "analysis"}>
        <ResponseAnalysisWizard
          key={analysisKey}
          filedCase={filedCase}
          onFileFollowUp={(context) => restartDrafting(context)}
        />
      </div>
    </div>
  );
}

export default App;
