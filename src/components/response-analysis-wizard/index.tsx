import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AppealItem,
  ClassificationResult,
  FiledCase,
  FollowUpContext,
  InformationRequest,
  ResponsePassage,
} from "../../types";
import { ANALYSIS_STEPS, MOCK_ORIGINAL_REQUESTS, type StepId } from "./constants";
import {
  alignRequests,
  analyseResponse,
  canAnalyseForReal,
  canAnalyseWithoutDraft,
  startReplyCase,
  classifyResponse,
  draftAppeal,
  ingestResponse,
} from "./mocks";
import { AlignStep, ClassifyStep, SummaryStep, UploadStep } from "./steps";
import {
  PageContainer,
  PageHeader,
  StepCard,
  StepCardActions,
  StepCardBody,
  StepProgress,
} from "../layout/Layout";
import { PrimaryButton, SecondaryButton } from "./ui";

// With a drafted case and a backend, the uploaded reply is read and judged for real against
// that case's requests. Otherwise the wizard shows its fixed sample data, and says so.
export default function ResponseAnalysisWizard({
  filedCase,
  onFileFollowUp,
}: {
  filedCase?: FiledCase;
  onFileFollowUp: (followUp: FollowUpContext) => void;
}) {
  const draftedCaseId = filedCase?.caseId;
  // Someone who drafted here can still analyse a reply to a different RTI.
  const [otherRti, setOtherRti] = useState(false);
  const fromDraft = canAnalyseForReal(draftedCaseId) && !otherRti;
  // A reply to an RTI not drafted here: analysed for real too, on a case of its own, against
  // the questions the citizen pastes or else the points read from the reply.
  const direct = !fromDraft && canAnalyseWithoutDraft();
  const isReal = fromDraft || direct;
  const [directCaseId, setDirectCaseId] = useState<string>();
  const [directRequests, setDirectRequests] = useState<InformationRequest[]>([]);
  const [questions, setQuestions] = useState("");
  const [summary, setSummary] = useState<string>();
  const [authority, setAuthority] = useState<string>();
  const [partial, setPartial] = useState(false);
  // No questions pasted: the findings are about points read from the reply, not the citizen's.
  const pointsFromReply = direct && directRequests.some((request) => request.category === "Point in the reply");
  const caseId = fromDraft ? draftedCaseId : directCaseId;
  const requests = fromDraft && filedCase ? filedCase.requests : direct ? directRequests : MOCK_ORIGINAL_REQUESTS;

  const [step, setStep] = useState<StepId>("upload");
  const stepIndex = ANALYSIS_STEPS.findIndex((s) => s.id === step);

  // A new step starts at its top; on a phone the Continue button is far down the previous one.
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, [step]);

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState("");
  const [ingestResult, setIngestResult] = useState<{
    pages: number;
    passages: ResponsePassage[];
    ocrUsed: boolean;
  } | null>(null);
  // The real analysis returns every finding at once; the steps then show it in stages.
  const [realResults, setRealResults] = useState<ClassificationResult[]>([]);

  const [alignment, setAlignment] = useState<Record<string, ResponsePassage[]>>({});
  const [classifications, setClassifications] = useState<Record<string, ClassificationResult>>(
    {},
  );

  function selectFile(next: File | null) {
    setFile(next);
    startAgain();
  }

  function changeQuestions(next: string) {
    setQuestions(next);
    startAgain();
  }

  // New inputs after a finished analysis get a case of their own; after a failed one (nothing
  // saved yet) the same case is used again, so a retry leaves no empty case behind.
  function startAgain() {
    if (ingestResult) setDirectCaseId(undefined);
    setIngestResult(null);
    setProcessingError("");
  }

  function analyseOtherRti() {
    setOtherRti(true);
    setDirectCaseId(undefined);
    setIngestResult(null);
    setProcessingError("");
  }

  function handleProcess() {
    if (!file) return;
    setIsProcessing(true);
    setProcessingError("");
    const processed = isReal
      ? (fromDraft ? Promise.resolve(draftedCaseId!) : directCaseId ? Promise.resolve(directCaseId) : startReplyCase(questions))
          .then((id) => {
            if (direct) setDirectCaseId(id);
            return analyseResponse(id, file, direct ? questions : undefined);
          })
          .then((analysis) => {
            if (direct && analysis.results.length === 0) {
              throw new Error("We couldn't read the points of this reply. Paste what you asked, or try again in a minute.");
            }
            setRealResults(analysis.results);
            if (direct) setDirectRequests(analysis.requests ?? []);
            setSummary(analysis.summary);
            setAuthority(analysis.authority);
            setPartial(Boolean(analysis.partial));
            return analysis;
          })
      : ingestResponse(file);
    processed
      .then((result) =>
        setIngestResult({ pages: result.pages, passages: result.passages, ocrUsed: result.ocrUsed }),
      )
      .catch((error: unknown) =>
        setProcessingError(error instanceof Error ? error.message : "We couldn't process this file."),
      )
      .finally(() => setIsProcessing(false));
  }

  function handleUploadContinue() {
    if (!ingestResult) return;
    if (isReal) {
      // The passages each finding cites are what it was matched to.
      setAlignment(Object.fromEntries(realResults.map((result) => [result.requestId, result.evidence])));
      setStep("align");
      return;
    }
    alignRequests(requests, ingestResult.passages).then((result) => {
      setAlignment(result);
      setStep("align");
    });
  }

  function handleAlignContinue() {
    if (isReal) {
      setClassifications(Object.fromEntries(realResults.map((result) => [result.requestId, result])));
      setStep("classify");
      return;
    }
    Promise.all(
      requests.map((request) =>
        classifyResponse(request, alignment[request.id] ?? []).then((result) => [
          request.id,
          result,
        ] as const),
      ),
    ).then((entries) => {
      setClassifications(Object.fromEntries(entries));
      setStep("classify");
    });
  }

  function goBack() {
    if (step === "align") setStep("upload");
    else if (step === "classify") setStep("align");
    else if (step === "summary") setStep("classify");
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow={`Step ${stepIndex + 1} of ${ANALYSIS_STEPS.length} · ${ANALYSIS_STEPS[stepIndex].label}`}
        title="Analyse the reply"
        accent="reply"
        intro={
          fromDraft
            ? `Upload the reply you received. Each of your ${requests.length} request${requests.length === 1 ? " is" : "s are"} checked against it.`
            : direct
              ? "Got a reply from PWD, or from any Public Information Officer? Upload it. You don't need to have drafted your RTI here."
              : "Upload the PIO's reply to see what was answered, dodged or refused, with the line of the reply each finding rests on."
        }
      />

      {!isReal && (
        <div className="flex max-w-3xl items-start gap-2.5 rounded-lg border border-edge bg-card p-4">
          <Info size={16} className="mt-0.5 shrink-0 text-brown" />
          <p className="text-[14px] text-ink-3">
            Sample data: this shows how a reply is analysed. Draft an application first to analyse
            a real reply against your own requests.
          </p>
        </div>
      )}

      {step === "upload" && canAnalyseWithoutDraft() && canAnalyseForReal(draftedCaseId) && (
        <p className="max-w-3xl text-[14.5px] text-ink-3">
          {otherRti ? "Analysing a reply to an RTI drafted elsewhere. " : "This checks the reply against the RTI you just drafted. "}
          <button
            type="button"
            onClick={otherRti ? () => { setOtherRti(false); setIngestResult(null); setProcessingError(""); } : analyseOtherRti}
            className="font-semibold text-ink-blue underline underline-offset-2"
          >
            {otherRti ? "Use the RTI I drafted instead" : "The reply is for a different RTI"}
          </button>
        </p>
      )}

      <StepProgress steps={ANALYSIS_STEPS} currentId={step} />

      <StepCard wide={step === "align" || step === "classify"}>
        <StepCardBody>
          {step === "upload" && (
            <UploadStep
              questions={direct ? questions : undefined}
              onQuestionsChange={changeQuestions}
              file={file}
              onFileSelect={selectFile}
              onProcess={handleProcess}
              isProcessing={isProcessing}
              processingError={processingError}
              ingestResult={ingestResult}
            />
          )}

          {step === "align" && (
            <AlignStep
              requests={requests}
              alignment={alignment}
              passages={ingestResult?.passages ?? []}
              pointsFromReply={pointsFromReply}
            />
          )}

          {step === "classify" && (
            <ClassifyStep
              requests={requests}
              results={classifications}
              passages={ingestResult?.passages ?? []}
              summary={summary}
              partial={partial}
            />
          )}

          {step === "summary" && (
            <SummaryStep
              requests={requests}
              results={classifications}
              onFileFollowUp={onFileFollowUp}
              onDraftAppeal={
                isReal && caseId
                  ? (items: AppealItem[]) =>
                      direct
                        ? draftAppeal(caseId, items, { authority, fromReply: pointsFromReply })
                        : draftAppeal(caseId, items)
                  : undefined
              }
            />
          )}
        </StepCardBody>

        <StepCardActions>
          <SecondaryButton onClick={goBack} disabled={step === "upload"}>
            Back
          </SecondaryButton>

          {step === "upload" && (
            <PrimaryButton onClick={handleUploadContinue} disabled={!ingestResult}>
              Continue
            </PrimaryButton>
          )}
          {step === "align" && <PrimaryButton onClick={handleAlignContinue}>Continue</PrimaryButton>}
          {step === "classify" && (
            <PrimaryButton onClick={() => setStep("summary")}>Continue</PrimaryButton>
          )}
          {step === "summary" && <PrimaryButton disabled>Done</PrimaryButton>}
        </StepCardActions>
      </StepCard>
    </PageContainer>
  );
}
