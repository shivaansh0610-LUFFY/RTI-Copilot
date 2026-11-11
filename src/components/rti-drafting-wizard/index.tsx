import { ArrowRight, CornerDownRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  ClarifyQuestion,
  DraftLanguage,
  DraftResult,
  FiledCase,
  FollowUpContext,
  InformationRequest,
} from "../../types";
import { ALL_STEPS, type StepId } from "./constants";
import { locationLine, withLocationLine, type IssueLocation } from "./location";
import {
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
  QualityReviewStep,
  RequestsStep,
} from "./steps";
import {
  PageContainer,
  PageHeader,
  StepCard,
  StepCardActions,
  StepCardBody,
  StepProgress,
} from "../layout/Layout";
import { PrimaryButton, SecondaryButton } from "./ui";

// A follow-up starts at the Requests step: the grievance and clarification are
// already known from the original application.
export default function RtiDraftingWizard({
  followUp,
  starter,
  onDraftReady,
  onAnalyseReply,
}: {
  followUp?: FollowUpContext;
  // The opening words of the description, from a problem tile on the home page.
  starter?: string;
  // Told the case and requests each time a draft is made, for the reply analysis later.
  onDraftReady?: (filed: FiledCase) => void;
  onAnalyseReply?: () => void;
}) {
  const [step, setStep] = useState<StepId>(followUp ? "requests" : "describe");

  const [grievance, setGrievance] = useState(
    followUp
      ? `Follow-up to an earlier RTI application to ${followUp.originalAuthority}. The reply did not fully answer ${followUp.requests.length} of the requests.`
      : (starter ?? ""),
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
  const [draftError, setDraftError] = useState("");
  const [language, setLanguage] = useState<DraftLanguage>("en");
  const [caseId, setCaseId] = useState<string | undefined>();

  const [isLoading, setIsLoading] = useState(false);

  const needsQualityReview = useMemo(
    () => carriedRequests.some((r) => r.quality === "needs-detail"),
    [carriedRequests],
  );

  const visibleSteps = useMemo(
    () =>
      step === "describe" || step === "clarify" || step === "requests"
        ? ALL_STEPS
        : ALL_STEPS.filter((s) => s.id !== "quality-review" || needsQualityReview),
    [step, needsQualityReview],
  );

  const stepNumber = visibleSteps.findIndex((s) => s.id === step) + 1;

  // A new step starts at its top; on a phone the Continue button is far down the previous one.
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, [step]);
  const stepLabel = ALL_STEPS.find((s) => s.id === step)?.label ?? "";

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

  // Every server call ends in .finally, so a failed one can never leave the spinner (and the
  // disabled Back and Continue buttons) on for good.
  function requestDraft(toDraft: InformationRequest[], draftLanguage: DraftLanguage) {
    setDraftError("");
    setIsLoading(true);
    generateDraft(toDraft, caseId, draftLanguage)
      .then((result) => {
        setDraft(result);
        setLanguage(draftLanguage);
        setStep("draft");
        onDraftReady?.({ caseId, requests: toDraft, grievance, draftText: result.draftText });
      })
      .catch(() => {
        setDraftError("We couldn't create the draft. Please try again.");
      })
      .finally(() => setIsLoading(false));
  }

  function handleRequestsContinue() {
    if (requests.length === 0) {
      setRequestsError("Add at least one request to continue.");
      return;
    }
    setRequestsError("");
    setCarriedRequests(requests);
    if (requests.some((r) => r.quality === "needs-detail")) {
      setStep("quality-review");
    } else {
      requestDraft(requests, language);
    }
  }

  function handleQualityReviewContinue() {
    requestDraft(carriedRequests, language);
  }

  function updateCarriedRequestTitle(id: string, title: string) {
    setCarriedRequests((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)));
  }

  function goBack() {
    setDraftError("");
    if (step === "clarify") setStep("describe");
    else if (step === "requests") setStep("clarify");
    else if (step === "quality-review") setStep("requests");
    else if (step === "draft") setStep(needsQualityReview ? "quality-review" : "requests");
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow={`Step ${stepNumber} of ${visibleSteps.length} · ${stepLabel}`}
        title={followUp ? "Draft your follow-up RTI" : "Draft your RTI application"}
        intro="Turn your complaint into an application that asks for the exact records PWD must keep."
      />

      <StepProgress steps={visibleSteps} currentId={step} />

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

      <StepCard>
        <StepCardBody>
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

          {step === "quality-review" && (
            <QualityReviewStep
              requests={carriedRequests}
              onTitleChange={updateCarriedRequestTitle}
            />
          )}

          {step === "draft" && draft && (
            <DraftStep
              draft={draft}
              requests={carriedRequests}
              language={language}
              onLanguageChange={(next) => requestDraft(carriedRequests, next)}
              isUpdating={isLoading}
            />
          )}

          {draftError && <p className="mt-3 text-[13px] text-red-600">{draftError}</p>}
        </StepCardBody>

        <StepCardActions>
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
          {step === "quality-review" && (
            <PrimaryButton onClick={handleQualityReviewContinue} disabled={isLoading}>
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Continue
            </PrimaryButton>
          )}
          {step === "draft" &&
            (onAnalyseReply ? (
              <PrimaryButton onClick={onAnalyseReply} disabled={isLoading}>
                Got the reply? Analyse it
                <ArrowRight size={14} />
              </PrimaryButton>
            ) : (
              <PrimaryButton disabled>Done</PrimaryButton>
            ))}
        </StepCardActions>
      </StepCard>
    </PageContainer>
  );
}
