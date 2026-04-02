import type { StoredProposalState } from "../persistence/types.js";
import type { ProposalLifecycleState, ProposalStateTransitionInput } from "./types.js";

const TERMINAL_STATUSES = new Set(["won", "lost", "expired", "paused"]);

export function applyProposalStateTransition(input: ProposalStateTransitionInput): ProposalLifecycleState {
  const normalizedStatus = input.proposalStatus.trim().toLowerCase();
  const previousTouchCounter = input.previousState?.touchCounter ?? 0;
  const previousStage = input.previousState?.currentFollowUpStage ?? "stage_0";
  const inputStageNumber = extractStageNumber(input.followUpStageFromInput);
  const previousStageNumber = extractStageNumber(previousStage);

  let currentFollowUpStage = normalizeStage(Math.max(inputStageNumber, previousStageNumber));
  let touchCounter = Math.max(previousTouchCounter, inputStageNumber, previousStageNumber);

  if (input.responseType === "success") {
    const nextStage = deriveStageFromDecision(input.decisionCode, currentFollowUpStage);
    currentFollowUpStage = nextStage;
    touchCounter = Math.max(touchCounter, extractStageNumber(nextStage));
  }

  if (input.responseType === "suppressed" && input.decisionCode === "SUPPRESS_TERMINAL_STATUS") {
    currentFollowUpStage = previousStage !== "stage_0" ? previousStage : input.followUpStageFromInput;
  }

  const terminalState = TERMINAL_STATUSES.has(normalizedStatus);
  const lastSuppressionReason =
    input.responseType === "suppressed" ? input.reasonCodes[0] ?? input.decisionCode : null;
  const lastEscalationStatus =
    input.responseType === "escalated"
      ? "escalated"
      : input.responseType === "pending_human"
        ? "pending_human"
        : null;

  return {
    proposalId: input.proposalId,
    currentFollowUpStage,
    touchCounter,
    lastEvaluatedAt: input.evaluatedAt,
    lastDecisionCode: input.decisionCode,
    lastActionStatus: input.actionStatus,
    lastSuppressionReason,
    lastEscalationStatus,
    latestKnownProposalStatus: normalizedStatus,
    terminalState
  };
}

export function shouldSuppressDuplicateAction(params: {
  previousState: StoredProposalState | null;
  nextDecisionCode: string;
  nextResponseType: string;
  currentProposalStatus: string;
}) {
  const previousState = params.previousState;
  if (!previousState) {
    return false;
  }

  const currentStatus = params.currentProposalStatus.trim().toLowerCase();
  if (previousState.terminalState && currentStatus === previousState.latestKnownProposalStatus) {
    return true;
  }

  return (
    params.nextResponseType === "success" &&
    previousState.lastResponseType === "success" &&
    previousState.lastDecisionCode === params.nextDecisionCode
  );
}

function deriveStageFromDecision(decisionCode: string, currentStage: string) {
  switch (decisionCode) {
    case "QUEUE_FOLLOW_UP_1":
    case "QUEUE_VIEW_INTENT_FOLLOW_UP_1":
      return "stage_1";
    case "QUEUE_FOLLOW_UP_2":
    case "QUEUE_VIEW_INTENT_FOLLOW_UP_2":
      return "stage_2";
    case "QUEUE_URGENCY_FOLLOW_UP":
      return "stage_urgent";
    case "QUEUE_CALL_TASK":
      return "stage_call";
    case "QUEUE_OWNER_NOTIFICATION":
      return "stage_owner_notification";
    default:
      return currentStage;
  }
}

function extractStageNumber(stage: string) {
  if (stage === "stage_urgent") return 3;
  if (stage === "stage_call") return 3;
  if (stage === "stage_owner_notification") return 3;

  const match = stage.match(/(\d+)/);
  if (!match) return 0;
  const parsed = Number.parseInt(match[1] ?? "0", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeStage(stageNumber: number) {
  return `stage_${stageNumber}`;
}
