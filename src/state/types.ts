import type { RuntimeResponse } from "../contracts/runtime-response.js";
import type { StoredProposalState } from "../persistence/types.js";

export type ProposalLifecycleState = {
  proposalId: string;
  currentFollowUpStage: string;
  touchCounter: number;
  lastEvaluatedAt: string;
  lastDecisionCode: string | null;
  lastActionStatus: RuntimeResponse["action"]["action_status"];
  lastSuppressionReason: string | null;
  lastEscalationStatus: string | null;
  latestKnownProposalStatus: string;
  terminalState: boolean;
};

export type ProposalStateTransitionInput = {
  proposalId: string;
  previousState: StoredProposalState | null;
  proposalStatus: string;
  responseType: RuntimeResponse["response_type"];
  decisionCode: string;
  actionStatus: RuntimeResponse["action"]["action_status"];
  reasonCodes: string[];
  followUpStageFromInput: string;
  evaluatedAt: string;
};
