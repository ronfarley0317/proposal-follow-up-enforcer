import type { AppConfig } from "./config.js";
import type { EnforcementEvent } from "./contracts/enforcement-event.js";
import type { RuntimeRequest } from "./contracts/runtime-request.js";
import { runtimeResponseSchema, type RuntimeResponse, type RuntimeResponseType } from "./contracts/runtime-response.js";
import type { DecisionResult } from "./decision-engine/types.js";
import { buildDashboardEvents } from "./events/builder.js";

type BuildStubResponseInput = {
  config: AppConfig;
  request: RuntimeRequest;
  responseType: RuntimeResponseType;
  executionId: string;
};

function baseStubResponse({
  config,
  request,
  responseType,
  executionId
}: BuildStubResponseInput): RuntimeResponse {
  const route =
    responseType === "success"
      ? "action"
      : responseType === "suppressed"
        ? "suppress"
        : responseType === "escalated"
          ? "escalation"
          : responseType === "pending_human"
            ? "human_review"
            : "failure";

  const actionStatus =
    responseType === "success"
      ? "queued"
      : responseType === "suppressed"
        ? "suppressed"
        : responseType === "escalated"
          ? "escalated"
          : responseType === "pending_human"
            ? "awaiting_human"
            : "failed";

  return {
    api_version: config.API_VERSION,
    request_id: request.request_id,
    idempotency_key: request.idempotency_key,
    agent_id: config.AGENT_ID,
    agent_version: config.AGENT_VERSION,
    execution_id: executionId,
    response_type: responseType,
    decision: {
      decision_code: "NOT_IMPLEMENTED",
      decision_label: "Decision engine not implemented",
      decision_confidence: 0,
      reason_codes: ["MILESTONE_2_STUB"],
      leakage_condition: "silent_proposal_decay"
    },
    action: {
      action_type: null,
      action_status: actionStatus,
      action_channel: null,
      action_target: null
    },
    routing: {
      route,
      priority: responseType === "escalated" || responseType === "pending_human" || responseType === "failed" ? "high" : "normal",
      human_review_required: responseType === "pending_human",
      escalation_required: responseType === "escalated"
    },
    dashboard_events: [] as EnforcementEvent[],
    errors:
      responseType === "failed"
        ? [
            {
              error_code: "NOT_IMPLEMENTED",
              error_message: "Milestone 2 validates the contract but does not implement decisioning yet.",
              retryable: false
            }
          ]
        : [],
    meta: {
      terminal: responseType === "failed"
    }
  };
}

export function buildFailedStubResponse(input: BuildStubResponseInput) {
  return baseStubResponse({ ...input, responseType: "failed" });
}

export function buildIdempotencyConflictResponse(input: Omit<BuildStubResponseInput, "responseType">) {
  const response = baseStubResponse({ ...input, responseType: "failed" });
  response.decision.decision_code = "IDEMPOTENCY_CONFLICT";
  response.decision.decision_label = "Reject conflicting request because idempotency key was reused";
  response.decision.reason_codes = ["IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD"];
  response.errors = [
    {
      error_code: "IDEMPOTENCY_CONFLICT",
      error_message: "The provided idempotency_key was already used for a materially different request payload.",
      retryable: false
    }
  ];
  response.meta.terminal = true;
  response.dashboard_events = buildDashboardEvents({
    config: input.config,
    request: input.request,
    response,
    decisionResult: {
      responseType: "failed",
      decisionCode: "IDEMPOTENCY_CONFLICT",
      decisionLabel: "Reject conflicting request because idempotency key was reused",
      decisionConfidence: 1,
      reasonCodes: ["IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD"],
      leakageCondition: "silent_proposal_decay",
      actionType: null,
      actionStatus: "failed",
      actionChannel: null,
      actionTarget: null,
      route: "failure",
      priority: "high",
      humanReviewRequired: false,
      escalationRequired: false,
      errors: response.errors,
      terminal: true
    },
    executionId: input.executionId
  });
  return runtimeResponseSchema.parse(response);
}

export function buildSuccessResponseScaffold(input: Omit<BuildStubResponseInput, "responseType">) {
  return baseStubResponse({ ...input, responseType: "success" });
}

export function buildSuppressedResponseScaffold(input: Omit<BuildStubResponseInput, "responseType">) {
  return baseStubResponse({ ...input, responseType: "suppressed" });
}

export function buildEscalatedResponseScaffold(input: Omit<BuildStubResponseInput, "responseType">) {
  return baseStubResponse({ ...input, responseType: "escalated" });
}

export function buildPendingHumanResponseScaffold(input: Omit<BuildStubResponseInput, "responseType">) {
  return baseStubResponse({ ...input, responseType: "pending_human" });
}

export function buildRuntimeResponseFromDecision(params: {
  config: AppConfig;
  request: RuntimeRequest;
  executionId: string;
  result: DecisionResult;
}): RuntimeResponse {
  const response: RuntimeResponse = {
    api_version: params.config.API_VERSION,
    request_id: params.request.request_id,
    idempotency_key: params.request.idempotency_key,
    agent_id: params.config.AGENT_ID,
    agent_version: params.config.AGENT_VERSION,
    execution_id: params.executionId,
    response_type: params.result.responseType,
    decision: {
      decision_code: params.result.decisionCode,
      decision_label: params.result.decisionLabel,
      decision_confidence: params.result.decisionConfidence,
      reason_codes: params.result.reasonCodes,
      leakage_condition: params.result.leakageCondition
    },
    action: {
      action_type: params.result.actionType,
      action_status: params.result.actionStatus,
      action_channel: params.result.actionChannel,
      action_target: params.result.actionTarget
    },
    routing: {
      route: params.result.route,
      priority: params.result.priority,
      human_review_required: params.result.humanReviewRequired,
      escalation_required: params.result.escalationRequired
    },
    dashboard_events: [],
    errors: params.result.errors,
    meta: {
      terminal: params.result.terminal
    }
  };

  response.dashboard_events = buildDashboardEvents({
    config: params.config,
    request: params.request,
    response,
    decisionResult: params.result,
    executionId: params.executionId
  });

  return runtimeResponseSchema.parse(response);
}
