import { useState } from "react";
import HomePage from "./components/home/HomePage";
import { SiteFooter, SiteHeader, type View } from "./components/layout/Layout";
import MyRtis from "./components/tracker/MyRtis";
import { loadRtis, saveRtis, titleFrom, upsertRti, type TrackedRti } from "./components/tracker/tracking";
import RtiDraftingWizard from "./components/rti-drafting-wizard";
import ResponseAnalysisWizard from "./components/response-analysis-wizard";
import type { FiledCase, FollowUpContext } from "./types";

function App() {
  const [view, setView] = useState<View>("home");
  const [followUp, setFollowUp] = useState<FollowUpContext | undefined>();
  // A problem tile's opening sentence, for a fresh application.
  const [starter, setStarter] = useState<string | undefined>();
  const [draftingKey, setDraftingKey] = useState(0);
  // The application drafted last, so its reply can be analysed against its own requests.
  const [filedCase, setFiledCase] = useState<FiledCase | undefined>();
  const [analysisKey, setAnalysisKey] = useState(0);
  // "My RTIs": every application drafted in this browser.
  const [rtis, setRtis] = useState<TrackedRti[]>(loadRtis);

  function changeRtis(update: (current: TrackedRti[]) => TrackedRti[]) {
    setRtis((current) => {
      const next = update(current);
      saveRtis(next);
      return next;
    });
  }

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
    // Redrafting (say, in Hindi) updates the same entry: same case, or same wizard run offline.
    const key = drafted.caseId ?? `local-${draftingKey}`;
    changeRtis((current) =>
      upsertRti(current, {
        key,
        caseId: drafted.caseId,
        title: titleFrom(drafted.grievance ?? ""),
        createdAt: new Date().toISOString(),
        requests: drafted.requests,
        draftText: drafted.draftText ?? "",
      }),
    );
  }

  function analyseTracked(rti: TrackedRti) {
    setFiledCase({ caseId: rti.caseId, requests: rti.requests });
    setAnalysisKey((k) => k + 1);
    setView("analysis");
  }

  function navigate(target: View) {
    if (target === "drafting") openDrafting();
    else setView(target);
    window.scrollTo?.({ top: 0 });
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader view={view} rtiCount={rtis.length} onNavigate={navigate} />

      {view === "home" && <HomePage onStart={handleStart} onAnalyse={() => setView("analysis")} />}

      {view === "rtis" && (
        <MyRtis
          rtis={rtis}
          onUpdate={(rti) => changeRtis((current) => current.map((r) => (r.key === rti.key ? rti : r)))}
          onDelete={(key) => changeRtis((current) => current.filter((r) => r.key !== key))}
          onAnalyse={analyseTracked}
          onStart={() => handleStart()}
        />
      )}

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

      <SiteFooter />
    </div>
  );
}

export default App;
