import { useState } from "react";
import type { ClassificationResult, ResponsePassage, ReviewVerdict } from "../../types";
import { getCaseStatus, MOCK_ORIGINAL_REQUESTS, type StepId } from "./constants";
import { alignRequests, classifyResponse, ingestResponse } from "./mocks";
import { AlignStep, ClassifyStep, ReviewStep, SummaryStep, UploadStep } from "./steps";
import { PrimaryButton, SecondaryButton, StepProgressBar } from "./ui";

export default function ResponseAnalysisWizard() {
  const [step, setStep] = useState<StepId>("upload");

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFailed, setProcessingFailed] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [ingestResult, setIngestResult] = useState<{
    pages: number;
    passages: ResponsePassage[];
    ocrUsed: boolean;
  } | null>(null);

  const [alignment, setAlignment] = useState<Record<string, ResponsePassage[]>>({});
  const [classifications, setClassifications] = useState<Record<string, ClassificationResult>>(
    {},
  );
  const [verdicts, setVerdicts] = useState<Record<string, ReviewVerdict>>({});

  const requests = MOCK_ORIGINAL_REQUESTS;

  function handleProcess() {
    setIsProcessing(true);
    setProcessingFailed(false);

    if (simulateFailure) {
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingFailed(true);
      }, 1500);
      return;
    }

    if (!file) return;
    ingestResponse(file).then((result) => {
      setIngestResult(result);
      setIsProcessing(false);
    });
  }

  function handleUploadContinue() {
    if (!ingestResult) return;
    alignRequests(requests, ingestResult.passages).then((result) => {
      setAlignment(result);
      setStep("align");
    });
  }

  function handleAlignContinue() {
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

  function handleVerdict(requestId: string, verdict: ReviewVerdict) {
    setVerdicts((prev) => ({ ...prev, [requestId]: verdict }));
  }

  function goBack() {
    if (step === "align") setStep("upload");
    else if (step === "classify") setStep("align");
    else if (step === "review") setStep("classify");
    else if (step === "summary") setStep("review");
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Response Analysis</h1>
        <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
          {getCaseStatus(step, isProcessing, processingFailed)}
        </span>
      </div>

      <StepProgressBar currentStepId={step} />

      <div className="flex min-h-[360px] flex-col rounded-md border border-slate-200">
        <div className="flex-1 p-6">
          {step === "upload" && (
            <UploadStep
              file={file}
              onFileSelect={setFile}
              onProcess={handleProcess}
              isProcessing={isProcessing}
              processingFailed={processingFailed}
              ingestResult={ingestResult}
              simulateFailure={simulateFailure}
              onToggleSimulateFailure={() => setSimulateFailure((v) => !v)}
            />
          )}

          {step === "align" && <AlignStep requests={requests} alignment={alignment} />}

          {step === "classify" && <ClassifyStep requests={requests} results={classifications} />}

          {step === "review" && (
            <ReviewStep
              requests={requests}
              results={classifications}
              verdicts={verdicts}
              onVerdict={handleVerdict}
            />
          )}

          {step === "summary" && (
            <SummaryStep requests={requests} results={classifications} verdicts={verdicts} />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 p-4">
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
            <PrimaryButton onClick={() => setStep("review")}>Continue</PrimaryButton>
          )}
          {step === "review" && (
            <PrimaryButton onClick={() => setStep("summary")}>Continue</PrimaryButton>
          )}
          {step === "summary" && <PrimaryButton disabled>Done</PrimaryButton>}
        </div>
      </div>
    </div>
  );
}
