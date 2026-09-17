import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { InformationRequest } from "../../types";
import { ALL_STEPS, CASE_STATUS, type StepId } from "./constants";
import { checkPublicInfo, decomposeGrievance, generateDraft } from "./mocks";
import {
  ClarifyStep,
  DescribeStep,
  DraftStep,
  PublicCheckStep,
  QualityReviewStep,
  RequestsStep,
} from "./steps";
import { PrimaryButton, SecondaryButton, StepProgressBar } from "./ui";

export default function RtiDraftingWizard() {
  const [step, setStep] = useState<StepId>("describe");

  const [grievance, setGrievance] = useState("");
  const [grievanceError, setGrievanceError] = useState("");

  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [clarifyError, setClarifyError] = useState("");

  const [requests, setRequests] = useState<InformationRequest[]>([]);
  const [carriedRequests, setCarriedRequests] = useState<InformationRequest[]>([]);
  const [draftText, setDraftText] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const needsQualityReview = useMemo(
    () => carriedRequests.some((r) => r.quality === "needs-detail"),
    [carriedRequests],
  );

  const visibleSteps = useMemo(
    () =>
      step === "describe" || step === "clarify" || step === "requests" || step === "public-check"
        ? ALL_STEPS
        : ALL_STEPS.filter((s) => s.id !== "quality-review" || needsQualityReview),
    [step, needsQualityReview],
  );

  function handleDescribeContinue() {
    if (grievance.trim().length < 10) {
      setGrievanceError("Please describe your issue in at least 10 characters.");
      return;
    }
    setGrievanceError("");
    setStep("clarify");
  }

  function handleClarifyContinue() {
    if (!clarificationAnswers.period || !clarificationAnswers.knowsAuthority) {
      setClarifyError("Please answer both questions before continuing.");
      return;
    }
    setClarifyError("");
    setIsLoading(true);
    decomposeGrievance(grievance, clarificationAnswers).then((result) => {
      setRequests(result);
      setIsLoading(false);
      setStep("requests");
    });
  }

  function handleRequestsContinue() {
    setIsLoading(true);
    checkPublicInfo(requests).then((result) => {
      setRequests(result);
      setIsLoading(false);
      setStep("public-check");
    });
  }

  function handlePublicCheckContinue() {
    const nonPublic = requests.filter((r) => !r.publiclyAvailable);
    setCarriedRequests(nonPublic);
    const stillNeedsDetail = nonPublic.some((r) => r.quality === "needs-detail");
    if (stillNeedsDetail) {
      setStep("quality-review");
    } else {
      setIsLoading(true);
      generateDraft(nonPublic).then((text) => {
        setDraftText(text);
        setIsLoading(false);
        setStep("draft");
      });
    }
  }

  function handleQualityReviewContinue() {
    setIsLoading(true);
    generateDraft(carriedRequests).then((text) => {
      setDraftText(text);
      setIsLoading(false);
      setStep("draft");
    });
  }

  function updateCarriedRequestTitle(id: string, title: string) {
    setCarriedRequests((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)));
  }

  function goBack() {
    if (step === "clarify") setStep("describe");
    else if (step === "requests") setStep("clarify");
    else if (step === "public-check") setStep("requests");
    else if (step === "quality-review") setStep("public-check");
    else if (step === "draft") setStep(needsQualityReview ? "quality-review" : "public-check");
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">RTI Drafting Assistant</h1>
        <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
          {CASE_STATUS[step]}
        </span>
      </div>

      <StepProgressBar steps={visibleSteps} currentStepId={step} />

      <div className="flex min-h-[360px] flex-col rounded-md border border-slate-200">
        <div className="flex-1 p-6">
          {step === "describe" && (
            <DescribeStep grievance={grievance} onChange={setGrievance} error={grievanceError} />
          )}

          {step === "clarify" && (
            <ClarifyStep
              answers={clarificationAnswers}
              onSelect={(key, value) =>
                setClarificationAnswers((prev) => ({ ...prev, [key]: value }))
              }
              error={clarifyError}
            />
          )}

          {step === "requests" && <RequestsStep requests={requests} />}

          {step === "public-check" && <PublicCheckStep requests={requests} />}

          {step === "quality-review" && (
            <QualityReviewStep
              requests={carriedRequests}
              onTitleChange={updateCarriedRequestTitle}
            />
          )}

          {step === "draft" && <DraftStep draftText={draftText} />}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 p-4">
          <SecondaryButton onClick={goBack} disabled={step === "describe" || isLoading}>
            Back
          </SecondaryButton>

          {step === "describe" && (
            <PrimaryButton onClick={handleDescribeContinue}>Continue</PrimaryButton>
          )}
          {step === "clarify" && (
            <PrimaryButton onClick={handleClarifyContinue} disabled={isLoading}>
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Continue
            </PrimaryButton>
          )}
          {step === "requests" && (
            <PrimaryButton onClick={handleRequestsContinue} disabled={isLoading}>
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Continue
            </PrimaryButton>
          )}
          {step === "public-check" && (
            <PrimaryButton onClick={handlePublicCheckContinue} disabled={isLoading}>
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Continue
            </PrimaryButton>
          )}
          {step === "quality-review" && (
            <PrimaryButton onClick={handleQualityReviewContinue} disabled={isLoading}>
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Continue
            </PrimaryButton>
          )}
          {step === "draft" && <PrimaryButton disabled>Done</PrimaryButton>}
        </div>
      </div>
    </div>
  );
}
