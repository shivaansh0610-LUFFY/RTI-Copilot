import { CornerDownRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ClarifyQuestion, DraftResult, FollowUpContext, InformationRequest } from "../../types";
import { ALL_STEPS, CASE_STATUS, type StepId } from "./constants";
import { locationLine, withLocationLine, type IssueLocation } from "./location";
import {
  checkPublicInfo,
  createCase,
  createCustomRequest,
  decomposeGrievance,
  generateDraft,
  getClarifyQuestions,
} from "./mocks";
import {
  ClarifyStep,
  DescribeStep,
  DraftStep,
  PublicCheckStep,
  QualityReviewStep,
  RequestsStep,
} from "./steps";
import { PrimaryButton, SecondaryButton, StepProgressBar } from "./ui";

// A follow-up starts at the Requests step: the grievance and clarification are
// already known from the original application.
export default function RtiDraftingWizard({ followUp }: { followUp?: FollowUpContext }) {
  const [step, setStep] = useState<StepId>(followUp ? "requests" : "describe");

  const [grievance, setGrievance] = useState(
    followUp
      ? `Follow-up to an earlier RTI application to ${followUp.originalAuthority}. The reply did not fully answer ${followUp.requests.length} of the requests.`
      : "",
  );
  const [grievanceError, setGrievanceError] = useState("");
  // The photo never leaves this browser. The location reaches the backend only as the
  // "Location:" line kept in `grievance`.
  const [photo, setPhoto] = useState<File | undefined>();
  const [issueLocation, setIssueLocation] = useState<IssueLocation | undefined>();

  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>(
    followUp ? { period: followUp.requests[0]?.period ?? "Last 1 year", knowsAuthority: "yes" } : {},
  );
  const [clarifyError, setClarifyError] = useState("");

  const [requests, setRequests] = useState<InformationRequest[]>(followUp?.requests ?? []);
  const [requestsError, setRequestsError] = useState("");
  const [carriedRequests, setCarriedRequests] = useState<InformationRequest[]>([]);
  const [draft, setDraft] = useState<DraftResult | undefined>();
  const [caseId, setCaseId] = useState<string | undefined>();

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

  function handleLocationChange(location: IssueLocation | undefined) {
    setIssueLocation(location);
    // A function update, so words typed while the street name loads are not overwritten.
    setGrievance((text) => withLocationLine(text, location && locationLine(location)));
  }

  function handleDescribeContinue() {
    // A location alone is not a description of the problem.
    if (withLocationLine(grievance, undefined).trim().length < 10) {
      setGrievanceError("Please describe your issue in at least 10 characters.");
      return;
    }
    setGrievanceError("");
    setIsLoading(true);
    createCase(grievance)
      .then((newCaseId) =>
        getClarifyQuestions(newCaseId).then((result) => {
          setCaseId(newCaseId);
          // Anything the grievance already stated is pre-filled, not asked again.
          const mergedAnswers = { ...clarificationAnswers, ...result.answers };
          setClarificationAnswers(mergedAnswers);
          setClarifyQuestions(result.questions);

          if (result.questions.length === 0) {
            // Nothing left to ask — skip straight to generating requests.
            return decomposeGrievance(newCaseId, mergedAnswers).then((decomposed) => {
              setRequests((prev) => [...decomposed, ...prev.filter((r) => r.source !== "generated")]);
              setStep("requests");
            });
          }
          setStep("clarify");
        }),
      )
      .catch(() => {
        setGrievanceError("We couldn't reach the server. Please try again.");
      })
      .finally(() => setIsLoading(false));
  }

  function handleClarifyContinue() {
    if (clarifyQuestions.some((question) => !clarificationAnswers[question.key])) {
      setClarifyError("Please answer every question before continuing.");
      return;
    }
    setClarifyError("");
    setIsLoading(true);
    decomposeGrievance(caseId, clarificationAnswers)
      .then((result) => {
        // Re-decomposing replaces only system-generated requests; the citizen's
        // own and follow-up requests are kept.
        setRequests((prev) => [...result, ...prev.filter((r) => r.source !== "generated")]);
        setStep("requests");
      })
      .catch(() => {
        setClarifyError("We couldn't reach the server. Please try again.");
      })
      .finally(() => setIsLoading(false));
  }

  function handleAddRequest(title: string, category: string) {
    return createCustomRequest(
      title,
      category,
      requests[0]?.authority ?? followUp?.originalAuthority,
      clarificationAnswers.period ?? "Last 1 year",
    ).then((request) => {
      setRequests((prev) => [...prev, request]);
      setRequestsError("");
    });
  }

  function handleRemoveRequest(id: string) {
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }

  function handleRequestsContinue() {
    if (requests.length === 0) {
      setRequestsError("Add at least one request to continue.");
      return;
    }
    setRequestsError("");
    setIsLoading(true);
    checkPublicInfo(requests, caseId).then((result) => {
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
      generateDraft(nonPublic, caseId).then((result) => {
        setDraft(result);
        setIsLoading(false);
        setStep("draft");
      });
    }
  }

  function handleQualityReviewContinue() {
    setIsLoading(true);
    generateDraft(carriedRequests, caseId).then((result) => {
      setDraft(result);
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

      {followUp && (
        <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3">
          <CornerDownRight size={16} className="mt-0.5 shrink-0 text-orange-700" />
          <p className="text-[13px] text-orange-800">
            Follow-up RTI to {followUp.originalAuthority}. {followUp.requests.length} unanswered
            request{followUp.requests.length === 1 ? " was" : "s were"} carried over from the
            response analysis.
          </p>
        </div>
      )}

      <div className="flex min-h-[360px] flex-col rounded-md border border-slate-200">
        <div className="flex-1 p-6">
          {step === "describe" && (
            <DescribeStep
              grievance={grievance}
              onChange={setGrievance}
              error={grievanceError}
              photo={photo}
              onPhotoChange={setPhoto}
              location={issueLocation}
              onLocationChange={handleLocationChange}
            />
          )}

          {step === "clarify" && (
            <ClarifyStep
              questions={clarifyQuestions}
              answers={clarificationAnswers}
              onSelect={(key, value) =>
                setClarificationAnswers((prev) => ({ ...prev, [key]: value }))
              }
              error={clarifyError}
            />
          )}

          {step === "requests" && (
            <RequestsStep
              requests={requests}
              isFollowUp={Boolean(followUp)}
              onAdd={handleAddRequest}
              onRemove={handleRemoveRequest}
              error={requestsError}
            />
          )}

          {step === "public-check" && <PublicCheckStep requests={requests} />}

          {step === "quality-review" && (
            <QualityReviewStep
              requests={carriedRequests}
              onTitleChange={updateCarriedRequestTitle}
            />
          )}

          {step === "draft" && draft && <DraftStep draft={draft} requests={carriedRequests} />}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 p-4">
          <SecondaryButton onClick={goBack} disabled={step === "describe" || isLoading}>
            Back
          </SecondaryButton>

          {step === "describe" && (
            <PrimaryButton onClick={handleDescribeContinue} disabled={isLoading}>
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Continue
            </PrimaryButton>
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
