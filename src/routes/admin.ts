import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config.js";
import type { RuntimeResponse } from "../contracts/runtime-response.js";
import { sendError } from "../errors.js";
import type { PersistenceAdapter } from "../persistence/types.js";
import { TimeoutError, withTimeout } from "../utils/timeout.js";

export async function registerAdminRoutes(
  app: FastifyInstance<any, any, any, any>,
  config: AppConfig,
  persistence: PersistenceAdapter
) {
  app.get("/api/v1/executions/:executionId", async (request, reply) => {
    const executionId = (request.params as { executionId?: string }).executionId;
    if (!executionId) {
      return sendError(reply, 400, "MISSING_EXECUTION_ID", "executionId is required");
    }

    try {
      const record = await withTimeout(
        persistence.findExecutionById(executionId),
        config.REQUEST_TIMEOUT_MS,
        () => new TimeoutError("Execution lookup timed out")
      );

      if (!record) {
        return sendError(reply, 404, "EXECUTION_NOT_FOUND", "Execution record was not found");
      }

      return reply.send({
        execution_id: record.executionId,
        request_id: record.requestId,
        idempotency_key: record.idempotencyKey,
        request_hash: record.requestHash,
        response_type: record.responseType,
        http_status_code: record.httpStatusCode,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        response: JSON.parse(record.serializedResponse)
      });
    } catch (error) {
      request.log.error({ err: error, execution_id: executionId }, "Execution lookup failed");
      return sendError(reply, 503, "PERSISTENCE_UNAVAILABLE", "Execution lookup failed");
    }
  });

  app.get("/api/v1/proposals/:proposalId/state", async (request, reply) => {
    const proposalId = (request.params as { proposalId?: string }).proposalId;
    if (!proposalId) {
      return sendError(reply, 400, "MISSING_PROPOSAL_ID", "proposalId is required");
    }

    try {
      const record = await withTimeout(
        persistence.getProposalState(proposalId),
        config.REQUEST_TIMEOUT_MS,
        () => new TimeoutError("Proposal state lookup timed out")
      );

      if (!record) {
        return sendError(reply, 404, "PROPOSAL_STATE_NOT_FOUND", "Proposal state was not found");
      }

      return reply.send(record);
    } catch (error) {
      request.log.error({ err: error, proposal_id: proposalId }, "Proposal state lookup failed");
      return sendError(reply, 503, "PERSISTENCE_UNAVAILABLE", "Proposal state lookup failed");
    }
  });

  app.get("/api/v1/proposals/:proposalId/diagnostics", async (request, reply) => {
    const proposalId = (request.params as { proposalId?: string }).proposalId;
    if (!proposalId) {
      return sendError(reply, 400, "MISSING_PROPOSAL_ID", "proposalId is required");
    }

    try {
      const state = await withTimeout(
        persistence.getProposalState(proposalId),
        config.REQUEST_TIMEOUT_MS,
        () => new TimeoutError("Proposal diagnostics state lookup timed out")
      );

      if (!state) {
        return sendError(reply, 404, "PROPOSAL_STATE_NOT_FOUND", "Proposal state was not found");
      }

      const execution = await withTimeout(
        persistence.findExecutionById(state.lastExecutionId),
        config.REQUEST_TIMEOUT_MS,
        () => new TimeoutError("Proposal diagnostics execution lookup timed out")
      );

      if (!execution) {
        return sendError(reply, 404, "EXECUTION_NOT_FOUND", "Latest execution record was not found");
      }

      const response = JSON.parse(execution.serializedResponse) as RuntimeResponse;
      const diagnosis = buildProposalDiagnostics({ proposalId, state, execution, response });

      return reply.send(diagnosis);
    } catch (error) {
      request.log.error({ err: error, proposal_id: proposalId }, "Proposal diagnostics lookup failed");
      return sendError(reply, 503, "PERSISTENCE_UNAVAILABLE", "Proposal diagnostics lookup failed");
    }
  });

  app.get("/api/v1/idempotency/:idempotencyKey", async (request, reply) => {
    const idempotencyKey = (request.params as { idempotencyKey?: string }).idempotencyKey;
    if (!idempotencyKey) {
      return sendError(reply, 400, "MISSING_IDEMPOTENCY_KEY", "idempotencyKey is required");
    }

    try {
      const record = await withTimeout(
        persistence.findIdempotencyRecord(idempotencyKey),
        config.REQUEST_TIMEOUT_MS,
        () => new TimeoutError("Idempotency record lookup timed out")
      );

      if (!record) {
        return sendError(reply, 404, "IDEMPOTENCY_RECORD_NOT_FOUND", "Idempotency record was not found");
      }

      return reply.send({
        idempotency_key: record.idempotencyKey,
        request_hash: record.requestHash,
        execution_id: record.executionId,
        response_type: record.responseType,
        http_status_code: record.httpStatusCode,
        first_seen_at: record.firstSeenAt,
        last_seen_at: record.lastSeenAt
      });
    } catch (error) {
      request.log.error({ err: error, idempotency_key: idempotencyKey }, "Idempotency lookup failed");
      return sendError(reply, 503, "PERSISTENCE_UNAVAILABLE", "Idempotency lookup failed");
    }
  });
}

function buildProposalDiagnostics(params: {
  proposalId: string;
  state: Awaited<ReturnType<PersistenceAdapter["getProposalState"]>> extends infer T ? Exclude<T, null> : never;
  execution: Awaited<ReturnType<PersistenceAdapter["findExecutionById"]>> extends infer T ? Exclude<T, null> : never;
  response: RuntimeResponse;
}) {
  const { proposalId, state, execution, response } = params;

  return {
    proposal_id: proposalId,
    execution_id: execution.executionId,
    response_type: response.response_type,
    headline: buildHeadline(response),
    why: buildWhy(response, state),
    blocking_reasons: response.decision.reason_codes,
    current_state: {
      latest_known_proposal_status: state.latestKnownProposalStatus,
      current_follow_up_stage: state.currentFollowUpStage,
      touch_counter: state.touchCounter,
      terminal_state: state.terminalState,
      last_decision_code: state.lastDecisionCode,
      last_action_status: state.lastActionStatus,
      last_suppression_reason: state.lastSuppressionReason,
      last_escalation_status: state.lastEscalationStatus,
      last_evaluated_at: state.lastEvaluatedAt
    },
    response_summary: {
      decision_label: response.decision.decision_label,
      action_type: response.action.action_type,
      action_status: response.action.action_status,
      action_target: response.action.action_target,
      risk_score: response.meta.risk_score ?? null,
      escalation_summary: response.meta.escalation_summary ?? null
    },
    recommended_next_step: buildNextStep(response, state)
  };
}

function buildHeadline(response: RuntimeResponse) {
  if (response.response_type === "success") {
    return "Follow-up action was queued";
  }

  if (response.response_type === "suppressed") {
    return "Follow-up was intentionally suppressed";
  }

  if (response.response_type === "escalated") {
    return "Proposal was escalated for owner attention";
  }

  if (response.response_type === "pending_human") {
    return "Proposal is waiting on human review";
  }

  return "Evaluation failed";
}

function buildWhy(response: RuntimeResponse, state: NonNullable<Awaited<ReturnType<PersistenceAdapter["getProposalState"]>>>) {
  if (response.response_type === "success") {
    return `The engine queued ${response.action.action_type ?? "an action"} because ${response.decision.decision_label.toLowerCase()}.`;
  }

  if (response.response_type === "suppressed") {
    const suppressionReason = state.lastSuppressionReason ?? response.decision.reason_codes[0] ?? "unknown";
    return `The engine suppressed follow-up because ${response.decision.decision_label.toLowerCase()}. Last suppression reason: ${suppressionReason}.`;
  }

  if (response.response_type === "escalated" || response.response_type === "pending_human") {
    return response.meta.escalation_summary?.owner_brief ?? response.decision.decision_label;
  }

  return response.errors[0]?.error_message ?? response.decision.decision_label;
}

function buildNextStep(response: RuntimeResponse, state: NonNullable<Awaited<ReturnType<PersistenceAdapter["getProposalState"]>>>) {
  if (response.meta.escalation_summary?.recommended_next_step) {
    return response.meta.escalation_summary.recommended_next_step;
  }

  if (response.response_type === "success") {
    return "Allow the queued action to run or inspect the downstream orchestrator if delivery is missing.";
  }

  if (response.response_type === "suppressed") {
    return state.terminalState
      ? "No further automation should run unless the proposal is reopened."
      : "Review the suppression reason and wait for a new trigger or state change.";
  }

  if (response.response_type === "failed") {
    return "Fix the input or contract issue and resend the request with a new idempotency key.";
  }

  return "Review the latest execution and proposal state together before taking manual action.";
}
