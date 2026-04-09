import type { RuntimeNormalizedPayload, RuntimeRequest } from "../contracts/runtime-request.js";
import type { StoredProposalState } from "../persistence/types.js";
import { shouldSuppressDuplicateAction } from "../state/transition.js";
import { classifyReply } from "./reply-classification.js";
import type { DecisionContext, DecisionEnginePolicy, DecisionResult, DerivedTiming } from "./types.js";

const TERMINAL_STATUSES = new Set(["won", "lost", "expired", "paused"]);

export function evaluateProposalDecision(params: {
  request: RuntimeRequest;
  policy: DecisionEnginePolicy;
  previousState: StoredProposalState | null;
  now?: Date;
}): DecisionResult {
  const now = params.now ?? new Date();
  const payload = params.request.inputs.normalized_payload;
  const derived = deriveTiming(payload, now, params.policy, params.previousState);
  const context: DecisionContext = {
    request: params.request,
    payload,
    previousState: params.previousState,
    now,
    policy: params.policy,
    derived
  };

  const failureResult = evaluateFailure(context);
  if (failureResult) return failureResult;

  const terminalSuppression = evaluateTerminalSuppression(context);
  if (terminalSuppression) return terminalSuppression;

  const hardSuppression = evaluateHardSuppression(context);
  if (hardSuppression) return hardSuppression;

  const escalation = evaluateEscalation(context);
  if (escalation) return escalation;

  const pendingHuman = evaluateHumanReview(context);
  if (pendingHuman) return pendingHuman;

  return evaluateCadence(context);
}

function evaluateFailure(context: DecisionContext): DecisionResult | null {
  const { payload, now, derived, policy } = context;

  const sentAt = Date.parse(payload.sent_at);
  if (sentAt > now.getTime()) {
    return buildResult({
      responseType: "failed",
      decisionCode: "INVALID_SENT_AT_FUTURE",
      decisionLabel: "Fail evaluation because sent_at is in the future",
      decisionConfidence: 0,
      reasonCodes: ["INVALID_TIMELINE", "SENT_AT_IN_FUTURE"],
      actionType: null,
      actionStatus: "failed",
      actionChannel: null,
      actionTarget: null,
      route: "failure",
      priority: "high",
      humanReviewRequired: false,
      escalationRequired: false,
      errors: [
        {
          error_code: "INVALID_PROPOSAL_TIMELINE",
          error_message: "sent_at cannot be in the future for deterministic follow-up evaluation.",
          retryable: false,
          field: "inputs.normalized_payload.sent_at"
        }
      ],
      terminal: true,
      derived
    });
  }

  const confidence = computeConfidence(context);
  if (confidence < policy.lowConfidenceThreshold) {
    return null;
  }

  if (derived.daysToExpiry !== null && derived.daysToExpiry < 0 && payload.proposal_status !== "expired") {
    return buildResult({
      responseType: "failed",
      decisionCode: "EXPIRED_STATE_MISMATCH",
      decisionLabel: "Fail evaluation because expiry metadata conflicts with proposal state",
      decisionConfidence: 0.2,
      reasonCodes: ["INVALID_STATE", "EXPIRY_STATE_MISMATCH"],
      actionType: null,
      actionStatus: "failed",
      actionChannel: null,
      actionTarget: null,
      route: "failure",
      priority: "high",
      humanReviewRequired: false,
      escalationRequired: false,
      errors: [
        {
          error_code: "INVALID_EXPIRY_STATE",
          error_message: "days_to_expiry is negative but proposal_status is not expired.",
          retryable: false,
          field: "inputs.normalized_payload.days_to_expiry"
        }
      ],
      terminal: true,
      derived
    });
  }

  return null;
}

function evaluateTerminalSuppression(context: DecisionContext): DecisionResult | null {
  const normalizedStatus = context.payload.proposal_status.trim().toLowerCase();

  if (!TERMINAL_STATUSES.has(normalizedStatus)) {
    return null;
  }

  return buildResult({
    responseType: "suppressed",
    decisionCode: "SUPPRESS_TERMINAL_STATUS",
    decisionLabel: "Suppress follow-up because proposal is already in a terminal state",
    decisionConfidence: 0.99,
    reasonCodes: ["TERMINAL_STATUS", `STATUS_${normalizedStatus.toUpperCase()}`],
    actionType: null,
    actionStatus: "suppressed",
    actionChannel: null,
    actionTarget: null,
    route: "suppress",
    priority: "normal",
    humanReviewRequired: false,
    escalationRequired: false,
    errors: [],
    terminal: normalizedStatus !== "paused",
    derived: context.derived
  });
}

function evaluateHardSuppression(context: DecisionContext): DecisionResult | null {
  const { payload, now, derived, policy } = context;

  if (derived.replyClassification?.classification === "closed") {
    return buildSuppressedResult(
      "SUPPRESS_REPLY_CLOSED",
      "Suppress follow-up because the latest reply indicates the proposal is moving forward",
      ["REPLY_CLASSIFIED", "REPLY_CLOSED"],
      derived
    );
  }

  if (derived.replyClassification?.classification === "lost") {
    return buildSuppressedResult(
      "SUPPRESS_REPLY_LOST",
      "Suppress follow-up because the latest reply indicates the opportunity is lost",
      ["REPLY_CLASSIFIED", "REPLY_LOST"],
      derived
    );
  }

  if (payload.do_not_contact === true) {
    return buildSuppressedResult(
      "SUPPRESS_DO_NOT_CONTACT",
      "Suppress follow-up because contact is marked do not contact",
      ["DO_NOT_CONTACT"],
      derived
    );
  }

  if (payload.manual_pause_until) {
    const pauseUntil = Date.parse(payload.manual_pause_until);
    if (!Number.isNaN(pauseUntil) && pauseUntil > now.getTime()) {
      return buildSuppressedResult(
        "SUPPRESS_MANUAL_PAUSE",
        "Suppress follow-up because proposal is manually paused",
        ["MANUAL_PAUSE_ACTIVE"],
        derived
      );
    }
  }

  if (
    derived.hoursSinceLastResponse !== null &&
    derived.hoursSinceLastResponse <= policy.recentReplySuppressionHours
  ) {
    const replyClassification = derived.replyClassification?.classification;
    const replyConfidence = derived.replyClassification?.confidence ?? 0.72;

    if (replyClassification === "interested") {
      return buildPendingHumanResult(
        "REVIEW_REPLY_INTERESTED",
        "Require human follow-up because the latest reply indicates active interest",
        ["RECENT_REPLY_DETECTED", "REPLY_INTERESTED"],
        payload.owner_email,
        Math.max(0.72, replyConfidence),
        derived
      );
    }

    if (replyClassification === "objection") {
      return buildPendingHumanResult(
        "REVIEW_REPLY_OBJECTION",
        "Require human follow-up because the latest reply contains an objection",
        ["RECENT_REPLY_DETECTED", "REPLY_OBJECTION"],
        payload.owner_email,
        Math.max(0.72, replyConfidence),
        derived
      );
    }

    if (replyClassification === "delay") {
      return buildSuppressedResult(
        "SUPPRESS_REPLY_DELAY",
        "Suppress follow-up because the latest reply asks to revisit later",
        ["RECENT_REPLY_DETECTED", "REPLY_DELAY"],
        derived
      );
    }

    return buildSuppressedResult(
      "SUPPRESS_RECENT_REPLY",
      "Suppress follow-up because a recent prospect reply was detected",
      replyClassification
        ? ["RECENT_REPLY_DETECTED", `REPLY_${String(replyClassification).toUpperCase()}`]
        : ["RECENT_REPLY_DETECTED"],
      derived
    );
  }

  if (derived.hoursSinceLastOutreach <= policy.recentOutreachSuppressionHours) {
    return buildSuppressedResult(
      "SUPPRESS_RECENT_OUTREACH",
      "Suppress follow-up because outreach is still inside cooldown",
      ["RECENT_OWNER_OUTREACH", "COOLDOWN_ACTIVE"],
      derived
    );
  }

  return null;
}

function evaluateEscalation(context: DecisionContext): DecisionResult | null {
  const { payload, derived, policy } = context;

  if (
    payload.proposal_value >= policy.escalationValueThreshold &&
    derived.silenceHours >= policy.escalationSilenceHours
  ) {
    return buildResult({
      responseType: "escalated",
      decisionCode: "ESCALATE_HIGH_VALUE_SILENCE",
      decisionLabel: "Escalate high-value silent proposal to owner",
      decisionConfidence: 0.93,
      reasonCodes: ["HIGH_VALUE_PROPOSAL", "SILENCE_THRESHOLD_EXCEEDED"],
      actionType: "owner_notification",
      actionStatus: "escalated",
      actionChannel: "internal_notification",
      actionTarget: payload.owner_email,
      route: "escalation",
      priority: "high",
      humanReviewRequired: true,
      escalationRequired: true,
      errors: [],
      terminal: false,
      derived
    });
  }

  return null;
}

function evaluateHumanReview(context: DecisionContext): DecisionResult | null {
  const { payload, policy } = context;
  const confidence = computeConfidence(context);
  const normalizedSegment = payload.segment?.trim().toLowerCase();
  const sensitiveSegment =
    normalizedSegment !== undefined && policy.sensitiveSegments.includes(normalizedSegment);

  if (payload.proposal_value >= policy.highValueApprovalThreshold) {
    return buildPendingHumanResult(
      "REVIEW_HIGH_VALUE_PROPOSAL",
      "Require human review because proposal value exceeds approval threshold",
      ["APPROVAL_THRESHOLD_EXCEEDED", "HIGH_VALUE_PROPOSAL"],
      payload.owner_email,
      0.55,
      context.derived
    );
  }

  if (sensitiveSegment || payload.competitor_flag === true) {
    return buildPendingHumanResult(
      "REVIEW_SENSITIVE_PROPOSAL",
      "Require human review because proposal is marked sensitive",
      sensitiveSegment ? ["SENSITIVE_SEGMENT"] : ["COMPETITOR_FLAG"],
      payload.owner_email,
      0.55,
      context.derived
    );
  }

  if (confidence < policy.lowConfidenceThreshold) {
    return buildPendingHumanResult(
      "REVIEW_LOW_CONFIDENCE",
      "Require human review because confidence is below threshold",
      ["LOW_CONFIDENCE"],
      payload.owner_email,
      confidence,
      context.derived
    );
  }

  return null;
}

function evaluateCadence(context: DecisionContext): DecisionResult {
  const { payload, derived, policy } = context;
  const touchCount = derived.touchCount;

  if (derived.duplicateDecisionDetected) {
    return buildSuppressedResult(
      "SUPPRESS_DUPLICATE_ACTION",
      "Suppress follow-up because the same enforcement action was already recorded",
      ["DUPLICATE_ACTION_PREVENTED"],
      derived
    );
  }

  if (
    derived.daysToExpiry !== null &&
    derived.daysToExpiry <= policy.expiryUrgencyDays
  ) {
    return buildSuccessResult(
      "QUEUE_URGENCY_FOLLOW_UP",
      "Queue urgency follow-up because proposal is near expiry",
      derived.recentViewIntent
        ? ["EXPIRY_URGENCY", "RECENT_VIEW_INTENT"]
        : ["EXPIRY_URGENCY"],
      "urgency_follow_up",
      "email",
      payload.contact_email,
      derived
    );
  }

  if (derived.recentViewIntent) {
    if (touchCount < 1) {
      return buildSuccessResult(
        "QUEUE_VIEW_INTENT_FOLLOW_UP_1",
        "Queue first follow-up because proposal was viewed and follow-up stalled",
        ["RECENT_VIEW_INTENT", "FOLLOW_UP_STALLED"],
        "follow_up_1_email",
        "email",
        payload.contact_email,
        derived
      );
    }

    if (touchCount < policy.maxAutomatedEmailTouches) {
      return buildSuccessResult(
        "QUEUE_VIEW_INTENT_FOLLOW_UP_2",
        "Queue second follow-up because proposal was viewed and remains silent",
        ["RECENT_VIEW_INTENT", "FOLLOW_UP_STALLED", "SECOND_TOUCH"],
        "follow_up_2_email",
        "email",
        payload.contact_email,
        derived
      );
    }
  }

  if (derived.hoursSinceSent >= policy.callTaskDelayDays * 24) {
    return buildSuccessResult(
      "QUEUE_CALL_TASK",
      "Queue call task because proposal has remained unresolved beyond call threshold",
      ["CALL_TASK_THRESHOLD_REACHED"],
      "call_task",
      "internal_task",
      payload.owner_email,
      derived
    );
  }

  if (derived.hoursSinceSent >= policy.followUp2DelayHours && touchCount < policy.maxAutomatedEmailTouches) {
    return buildSuccessResult(
      "QUEUE_FOLLOW_UP_2",
      "Queue second follow-up email",
      ["FOLLOW_UP_2_WINDOW_REACHED"],
      "follow_up_2_email",
      "email",
      payload.contact_email,
      derived
    );
  }

  if (derived.hoursSinceSent >= policy.followUp2DelayHours && touchCount >= policy.maxAutomatedEmailTouches) {
    return buildSuccessResult(
      "QUEUE_OWNER_NOTIFICATION",
      "Queue owner notification because automated email limit has been reached",
      ["AUTOMATED_EMAIL_LIMIT_REACHED", "OWNER_NOTIFICATION_REQUIRED"],
      "owner_notification",
      "internal_notification",
      payload.owner_email,
      derived
    );
  }

  if (derived.hoursSinceSent >= policy.followUp1DelayHours && touchCount < 1) {
    return buildSuccessResult(
      "QUEUE_FOLLOW_UP_1",
      "Queue first follow-up email",
      ["FOLLOW_UP_1_WINDOW_REACHED"],
      "follow_up_1_email",
      "email",
      payload.contact_email,
      derived
    );
  }

  return buildSuppressedResult(
    "SUPPRESS_NO_ACTION_DUE",
    "Suppress follow-up because no cadence action is currently due",
    ["NO_ACTION_DUE"],
    derived
  );
}

function deriveTiming(
  payload: RuntimeNormalizedPayload,
  now: Date,
  policy: DecisionEnginePolicy,
  previousState: StoredProposalState | null
): DerivedTiming {
  const nowMs = now.getTime();
  const sentAtMs = Date.parse(payload.sent_at);
  const lastOutreachAtMs = Date.parse(payload.last_outreach_at);
  const lastResponseAtMs = payload.last_response_at ? Date.parse(payload.last_response_at) : null;
  const lastViewAtMs = payload.proposal_viewed_at ? Date.parse(payload.proposal_viewed_at) : null;

  const hoursSinceSent = diffHours(nowMs, sentAtMs);
  const hoursSinceLastOutreach = diffHours(nowMs, lastOutreachAtMs);
  const hoursSinceLastResponse = lastResponseAtMs === null ? null : diffHours(nowMs, lastResponseAtMs);
  const hoursSinceLastView = lastViewAtMs === null ? null : diffHours(nowMs, lastViewAtMs);
  const touchCount = Math.max(parseTouchCount(payload.follow_up_stage), previousState?.touchCounter ?? 0);
  const silenceHours = Math.min(hoursSinceSent, hoursSinceLastOutreach);
  const daysToExpiry = payload.days_to_expiry ?? null;
  const duplicateDecisionDetected = shouldSuppressDuplicateAction({
    previousState,
    nextDecisionCode: inferNextCadenceDecision(payload, {
      hoursSinceSent,
      daysToExpiry,
      recentViewIntent:
        hoursSinceLastView !== null &&
        hoursSinceLastView <= policy.viewIntentPriorityWindowHours &&
        hoursSinceLastOutreach > policy.recentOutreachSuppressionHours,
      touchCount
    }),
    nextResponseType: "success",
    currentProposalStatus: payload.proposal_status
  });

  return {
    nowIso: now.toISOString(),
    hoursSinceSent,
    hoursSinceLastOutreach,
    hoursSinceLastResponse,
    hoursSinceLastView,
    daysToExpiry,
    touchCount,
    recentViewIntent:
      hoursSinceLastView !== null &&
      hoursSinceLastView <= policy.viewIntentPriorityWindowHours &&
      hoursSinceLastOutreach > policy.recentOutreachSuppressionHours,
    silenceHours,
    duplicateDecisionDetected,
    replyClassification: classifyReply(payload)
  };
}

function inferNextCadenceDecision(
  payload: RuntimeNormalizedPayload,
  data: {
    hoursSinceSent: number;
    daysToExpiry: number | null;
    recentViewIntent: boolean;
    touchCount: number;
  }
) {
  if (data.daysToExpiry !== null && data.daysToExpiry <= 2) return "QUEUE_URGENCY_FOLLOW_UP";
  if (data.recentViewIntent && data.touchCount < 1) return "QUEUE_VIEW_INTENT_FOLLOW_UP_1";
  if (data.recentViewIntent && data.touchCount < 2) return "QUEUE_VIEW_INTENT_FOLLOW_UP_2";
  if (data.hoursSinceSent >= 7 * 24) return "QUEUE_CALL_TASK";
  if (data.hoursSinceSent >= 72 && data.touchCount < 2) return "QUEUE_FOLLOW_UP_2";
  if (data.hoursSinceSent >= 72 && data.touchCount >= 2) return "QUEUE_OWNER_NOTIFICATION";
  if (data.hoursSinceSent >= 24 && data.touchCount < 1) return "QUEUE_FOLLOW_UP_1";
  return "SUPPRESS_NO_ACTION_DUE";
}

function parseTouchCount(followUpStage: string) {
  const match = followUpStage.match(/(\d+)/);
  if (!match) {
    return 0;
  }

  const parsed = Number.parseInt(match[1] ?? "0", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function diffHours(nowMs: number, dateMs: number) {
  return (nowMs - dateMs) / (1000 * 60 * 60);
}

function computeConfidence(context: DecisionContext) {
  const { payload } = context;
  let confidence = 0.92;

  if (!payload.follow_up_stage.match(/\d+/)) {
    confidence -= 0.18;
  }

  if (payload.proposal_status.trim().toLowerCase() === "unknown") {
    confidence -= 0.2;
  }

  if (payload.segment?.trim().toLowerCase() === "custom") {
    confidence -= 0.12;
  }

  return Math.max(0, Number(confidence.toFixed(2)));
}

function buildSuppressedResult(
  decisionCode: string,
  decisionLabel: string,
  reasonCodes: string[],
  derived: DerivedTiming
): DecisionResult {
  return buildResult({
    responseType: "suppressed",
    decisionCode,
    decisionLabel,
    decisionConfidence: 0.97,
    reasonCodes,
    actionType: null,
    actionStatus: "suppressed",
    actionChannel: null,
    actionTarget: null,
    route: "suppress",
    priority: "normal",
    humanReviewRequired: false,
    escalationRequired: false,
    errors: [],
    terminal: false,
    derived
  });
}

function buildPendingHumanResult(
  decisionCode: string,
  decisionLabel: string,
  reasonCodes: string[],
  actionTarget: string | null,
  confidence = 0.55,
  derived: DerivedTiming
): DecisionResult {
  return buildResult({
    responseType: "pending_human",
    decisionCode,
    decisionLabel,
    decisionConfidence: confidence,
    reasonCodes,
    actionType: "owner_notification",
    actionStatus: "awaiting_human",
    actionChannel: "internal_review",
    actionTarget,
    route: "human_review",
    priority: "high",
    humanReviewRequired: true,
    escalationRequired: false,
    errors: [],
    terminal: false,
    derived
  });
}

function buildSuccessResult(
  decisionCode: string,
  decisionLabel: string,
  reasonCodes: string[],
  actionType: string,
  actionChannel: string,
  actionTarget: string,
  derived: DerivedTiming
): DecisionResult {
  return buildResult({
    responseType: "success",
    decisionCode,
    decisionLabel,
    decisionConfidence: 0.9,
    reasonCodes,
    actionType,
    actionStatus: "queued",
    actionChannel,
    actionTarget,
    route: "action",
    priority: actionType === "call_task" || actionType === "urgency_follow_up" ? "high" : "normal",
    humanReviewRequired: false,
    escalationRequired: false,
    errors: [],
    terminal: false,
    derived
  });
}

function buildResult(input: Omit<DecisionResult, "leakageCondition">): DecisionResult {
  return {
    ...input,
    leakageCondition: "silent_proposal_decay"
  };
}
