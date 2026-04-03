import crypto from "node:crypto";

import type { AppConfig } from "../config.js";
import { enforcementEventSchema, type EnforcementEvent } from "../contracts/enforcement-event.js";
import type { RuntimeRequest } from "../contracts/runtime-request.js";
import type { RuntimeResponse } from "../contracts/runtime-response.js";
import type { DecisionResult } from "../decision-engine/types.js";
import { getDaysSinceSent, getProposalValueBand } from "./helpers.js";

function mapEventType(responseType: RuntimeResponse["response_type"]): EnforcementEvent["event_type"] {
  switch (responseType) {
    case "success":
      return "agent.action_queued";
    case "suppressed":
      return "agent.action_suppressed";
    case "escalated":
      return "agent.escalated";
    case "pending_human":
      return "agent.human_review_requested";
    case "failed":
      return "agent.failed";
  }
}

function mapOutcome(responseType: RuntimeResponse["response_type"]): EnforcementEvent["status"]["outcome"] {
  switch (responseType) {
    case "success":
      return "success";
    case "suppressed":
      return "suppressed";
    case "escalated":
      return "escalated";
    case "pending_human":
      return "pending_human";
    case "failed":
      return "failed";
  }
}

function getAgentName(agentId: string) {
  if (agentId === "proposal-follow-up-enforcer") {
    return "Proposal Follow-Up Enforcer";
  }

  return agentId;
}

export function buildDashboardEvents(params: {
  config: AppConfig;
  request: RuntimeRequest;
  response: RuntimeResponse;
  decisionResult: DecisionResult;
  executionId: string;
  eventTime?: Date;
}): EnforcementEvent[] {
  const eventTime = params.eventTime ?? new Date();
  const payload = params.request.inputs.normalized_payload;
  const primaryError = params.response.errors[0] ?? null;
  const event: EnforcementEvent = {
    schema_version: "1.0.0",
    event_id: `evt_${crypto.randomUUID()}`,
    event_time: eventTime.toISOString(),
    event_type: mapEventType(params.response.response_type),
    agent: {
      agent_id: params.config.AGENT_ID,
      agent_name: getAgentName(params.config.AGENT_ID),
      agent_version: params.config.AGENT_VERSION,
      library_version: params.config.API_VERSION,
      owner: params.request.orchestrator.name
    },
    execution: {
      execution_id: params.executionId,
      workflow_id: params.request.orchestrator.workflow_id,
      trigger_type: params.request.trigger.trigger_type,
      trigger_id: params.request.trigger.trigger_id ?? null,
      source_systems: params.request.trigger.source_systems,
      idempotency_key: params.request.idempotency_key,
      latency_ms: null
    },
    entity: {
      entity_type: params.request.entity.entity_type === "proposal" ? "proposal" : "other",
      entity_id: params.request.entity.entity_id,
      parent_entity_type: "account",
      parent_entity_id: params.request.entity.account_id ?? payload.account_id,
      customer_id: params.request.entity.customer_id ?? null,
      account_id: params.request.entity.account_id ?? payload.account_id,
      external_refs: []
    },
    decision: {
      decision_code: params.response.decision.decision_code,
      decision_label: params.response.decision.decision_label,
      decision_confidence: params.response.decision.decision_confidence,
      reason_codes: params.response.decision.reason_codes,
      policy_version: params.request.agent.policy_version ?? null,
      leakage_condition: params.response.decision.leakage_condition
    },
    action: {
      action_type: params.response.action.action_type,
      action_status: params.response.action.action_status,
      action_channel: params.response.action.action_channel,
      action_target: params.response.action.action_target,
      scheduled_for: null,
      completed_at: null
    },
    revenue: {
      currency: payload.currency,
      revenue_at_risk: payload.proposal_value,
      revenue_protected: 0,
      revenue_recovered: 0,
      expected_value: 0,
      attribution_window_days: 30,
      revenue_formula_ref: "proposal_followup_v1"
    },
    escalation: {
      escalation_flag: params.decisionResult.escalationRequired,
      escalation_level: params.decisionResult.escalationRequired ? "high" : null,
      escalation_target: params.decisionResult.escalationRequired ? payload.owner_email : null,
      escalation_reason: params.decisionResult.escalationRequired
        ? params.response.decision.decision_label
        : null,
      escalation_due_at: null
    },
    human_review: {
      human_review_required: params.response.routing.human_review_required,
      human_review_status: params.response.routing.human_review_required ? "pending" : "not_required",
      reviewer_id: null,
      review_notes: null,
      reviewed_at: null
    },
    status: {
      outcome: mapOutcome(params.response.response_type),
      terminal: params.response.meta.terminal,
      error_code: primaryError?.error_code ?? null,
      error_message: primaryError?.error_message ?? null
    },
    metadata: {
      dry_run: params.response.meta.dry_run ?? false,
      follow_up_stage: payload.follow_up_stage,
      days_since_sent: getDaysSinceSent(payload, eventTime),
      view_count: payload.view_count ?? 0,
      days_to_expiry: payload.days_to_expiry ?? null,
      proposal_value_band: getProposalValueBand(payload.proposal_value),
      service_category: payload.service_category
    }
  };

  return [enforcementEventSchema.parse(event)];
}
