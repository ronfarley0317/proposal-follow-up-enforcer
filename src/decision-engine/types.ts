import type { RuntimeRequest, RuntimeNormalizedPayload } from "../contracts/runtime-request.js";
import type { ReplyClassificationResult } from "./reply-classification.js";
import type { RuntimeResponse } from "../contracts/runtime-response.js";
import type { StoredProposalState } from "../persistence/types.js";

export type DecisionRoute = RuntimeResponse["routing"]["route"];
export type DecisionResponseType = RuntimeResponse["response_type"];

export type DecisionEnginePolicy = {
  followUp1DelayHours: number;
  followUp2DelayHours: number;
  callTaskDelayDays: number;
  maxAutomatedEmailTouches: number;
  recentReplySuppressionHours: number;
  recentOutreachSuppressionHours: number;
  escalationValueThreshold: number;
  escalationSilenceHours: number;
  highValueApprovalThreshold: number;
  expiryUrgencyDays: number;
  lowConfidenceThreshold: number;
  viewIntentPriorityWindowHours: number;
  riskScoreHighThreshold: number;
  riskScoreMediumThreshold: number;
  highRiskServiceCategories: string[];
  sensitiveSegments: string[];
};

export type DerivedTiming = {
  nowIso: string;
  hoursSinceSent: number;
  hoursSinceLastOutreach: number;
  hoursSinceLastResponse: number | null;
  hoursSinceLastView: number | null;
  daysToExpiry: number | null;
  touchCount: number;
  recentViewIntent: boolean;
  silenceHours: number;
  duplicateDecisionDetected: boolean;
  replyClassification: ReplyClassificationResult | null;
};

export type DecisionResult = {
  responseType: DecisionResponseType;
  decisionCode: string;
  decisionLabel: string;
  decisionConfidence: number;
  reasonCodes: string[];
  leakageCondition: string | null;
  actionType: string | null;
  actionStatus: RuntimeResponse["action"]["action_status"];
  actionChannel: string | null;
  actionTarget: string | null;
  route: DecisionRoute;
  priority: RuntimeResponse["routing"]["priority"];
  humanReviewRequired: boolean;
  escalationRequired: boolean;
  errors: RuntimeResponse["errors"];
  terminal: boolean;
  derived: DerivedTiming;
};

export type DecisionContext = {
  request: RuntimeRequest;
  payload: RuntimeNormalizedPayload;
  previousState: StoredProposalState | null;
  now: Date;
  policy: DecisionEnginePolicy;
  derived: DerivedTiming;
};
