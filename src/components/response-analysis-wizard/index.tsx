import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AppealItem,
  ClassificationResult,
  FiledCase,
  FollowUpContext,
  ResponsePassage,
} from "../../types";
import { ANALYSIS_STEPS, MOCK_ORIGINAL_REQUESTS, type StepId } from "./constants";
import {
  alignRequests,
  analyseResponse,
  canAnalyseForReal,
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
  const caseId = filedCase?.caseId;
  const isReal = canAnalyseForReal(caseId);
  const requests = isReal && filedCase ? filedCase.requests : MOCK_ORIGINAL_REQUESTS;

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
    setIngestResult(null);
    setProcessingError("");
  }

  function handleProcess() {
    if (!file) return;
    setIsProcessing(true);
    setProcessingError("");
    const processed = isReal
      ? analyseResponse(caseId, file).then((analysis) => {
          setRealResults(analysis.results);
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
        intro={
          isReal
            ? `Upload the reply you received. Each of your ${requests.length} request${requests.length === 1 ? " is" : "s are"} checked against it.`
            : "Upload the PIO's reply to see what was answered, dodged or refused, with the line of the reply each finding rests on."
        }
      />

      {!isReal && (
        <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <p className="text-[13px] text-slate-600">
            Sample data: this shows how a reply is analysed. Draft an application first to analyse
            a real reply against your own requests.
          </p>
        </div>
      )}

      <StepProgress steps={ANALYSIS_STEPS} currentId={step} />

      <StepCard>
        <StepCardBody>
          {step === "upload" && (
            <UploadStep
              file={file}
              onFileSelect={selectFile}
              onProcess={handleProcess}
              isProcessing={isProcessing}
              processingError={processingError}
              ingestResult={ingestResult}
            />
          )}

          {step === "align" && (
            <AlignStep requests={requests} alignment={alignment} passages={ingestResult?.passages ?? []} />
          )}

          {step === "classify" && <ClassifyStep requests={requests} results={classifications} />}

          {step === "summary" && (
            <SummaryStep
              requests={requests}
              results={classifications}
              onFileFollowUp={onFileFollowUp}
              onDraftAppeal={
                isReal ? (items: AppealItem[]) => draftAppeal(caseId, items) : undefined
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
