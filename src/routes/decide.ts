import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";

import type { AppConfig } from "../config.js";
import { isDryRunRequest, runtimeRequestSchema } from "../contracts/runtime-request.js";
import { evaluateProposalDecision } from "../decision-engine/evaluate.js";
import { buildDecisionPolicy } from "../decision-engine/policy.js";
import { classifyValidationIssues, sendError } from "../errors.js";
import { hashRequestPayload } from "../persistence/hash.js";
import type { PersistenceAdapter } from "../persistence/types.js";
import { buildIdempotencyConflictResponse, buildRuntimeResponseFromDecision } from "../responses.js";
import { applyProposalStateTransition } from "../state/transition.js";
import { summarizeDecisionRequest } from "../utils/request-summary.js";
import { TimeoutError, withTimeout } from "../utils/timeout.js";

export async function registerDecideRoute(
  app: FastifyInstance,
  config: AppConfig,
  persistence: PersistenceAdapter
) {
  app.post("/api/v1/decide", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = runtimeRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      const validationError = classifyValidationIssues(parsed.error.issues);
      request.log.warn({ issues: validationError.details }, "Request validation failed");
      return sendError(
        reply,
        validationError.statusCode,
        validationError.errorCode,
        validationError.errorMessage,
        validationError.details
      );
    }

    if (parsed.data.api_version !== config.API_VERSION) {
      request.log.warn(
        { api_version: parsed.data.api_version, supported_version: config.API_VERSION },
        "Unsupported API version"
      );
      return sendError(
        reply,
        422,
        "UNSUPPORTED_API_VERSION",
        `Unsupported api_version: ${parsed.data.api_version}. Supported version is ${config.API_VERSION}`
      );
    }

    if (parsed.data.agent.agent_id !== config.AGENT_ID) {
      request.log.warn(
        { requested_agent_id: parsed.data.agent.agent_id, runtime_agent_id: config.AGENT_ID },
        "Agent identifier mismatch"
      );
      return sendError(
        reply,
        422,
        "INVALID_AGENT_ID",
        `agent.agent_id must be ${config.AGENT_ID}`
      );
    }

    request.log.info(
      {
        ...summarizeDecisionRequest(parsed.data),
        dry_run: isDryRunRequest(parsed.data)
      },
      "Decision request validated"
    );

    if (isDryRunRequest(parsed.data)) {
      let previousState;
      try {
        previousState = await withTimeout(
          persistence.getProposalState(parsed.data.inputs.normalized_payload.proposal_id),
          config.REQUEST_TIMEOUT_MS,
          () => new TimeoutError("Proposal state lookup timed out")
        );
      } catch (error) {
        request.log.error({ err: error, request_id: parsed.data.request_id }, "Proposal state lookup failed");
        return sendError(reply, 503, "PERSISTENCE_UNAVAILABLE", "Persistence dependency is unavailable");
      }

      const executionId = `exec_${crypto.randomUUID()}`;
      const decision = evaluateProposalDecision({
        request: parsed.data,
        policy: buildDecisionPolicy(config),
        previousState
      });
      const response = buildRuntimeResponseFromDecision({
        config,
        request: parsed.data,
        executionId,
        result: decision,
        dryRun: true
      });

      request.log.info(
        {
          request_id: parsed.data.request_id,
          execution_id: executionId,
          response_type: response.response_type
        },
        "Dry-run decision completed without persistence"
      );

      return reply.code(200).send(response);
    }

    const requestHash = hashRequestPayload(parsed.data);
    let idempotencyResult;
    try {
      idempotencyResult = await withTimeout(
        persistence.getIdempotencyResult(parsed.data.idempotency_key, requestHash),
        config.REQUEST_TIMEOUT_MS,
        () => new TimeoutError("Idempotency lookup timed out")
      );
    } catch (error) {
      request.log.error({ err: error, request_id: parsed.data.request_id }, "Idempotency lookup failed");
      return sendError(reply, 503, "PERSISTENCE_UNAVAILABLE", "Persistence dependency is unavailable");
    }

    if (idempotencyResult.status === "replay") {
      request.log.info(
        {
          request_id: parsed.data.request_id,
          idempotency_key: parsed.data.idempotency_key,
          execution_id: idempotencyResult.record.executionId
        },
        "Returning stored idempotent response"
      );

      return reply
        .code(idempotencyResult.record.httpStatusCode)
        .type("application/json")
        .send(JSON.parse(idempotencyResult.record.serializedResponse));
    }

    if (idempotencyResult.status === "conflict") {
      const conflictResponse = buildIdempotencyConflictResponse({
        config,
        request: parsed.data,
        executionId: idempotencyResult.record.executionId
      });

      request.log.warn(
        {
          request_id: parsed.data.request_id,
          idempotency_key: parsed.data.idempotency_key,
          execution_id: idempotencyResult.record.executionId
        },
        "Idempotency conflict detected"
      );

      return reply.code(409).send(conflictResponse);
    }

    let previousState;
    try {
      previousState = await withTimeout(
        persistence.getProposalState(parsed.data.inputs.normalized_payload.proposal_id),
        config.REQUEST_TIMEOUT_MS,
        () => new TimeoutError("Proposal state lookup timed out")
      );
    } catch (error) {
      request.log.error({ err: error, request_id: parsed.data.request_id }, "Proposal state lookup failed");
      return sendError(reply, 503, "PERSISTENCE_UNAVAILABLE", "Persistence dependency is unavailable");
    }

    const executionId = `exec_${crypto.randomUUID()}`;
    const decision = evaluateProposalDecision({
      request: parsed.data,
      policy: buildDecisionPolicy(config),
      previousState
    });
    const response = buildRuntimeResponseFromDecision({
      config,
      request: parsed.data,
      executionId,
      result: decision,
      dryRun: false
    });
    const httpStatusCode = decision.responseType === "failed" ? 200 : 200;

    const now = new Date().toISOString();
    const nextState = applyProposalStateTransition({
      proposalId: parsed.data.inputs.normalized_payload.proposal_id,
      previousState,
      proposalStatus: parsed.data.inputs.normalized_payload.proposal_status,
      responseType: response.response_type,
      decisionCode: response.decision.decision_code,
      actionStatus: response.action.action_status,
      reasonCodes: response.decision.reason_codes,
      followUpStageFromInput: parsed.data.inputs.normalized_payload.follow_up_stage,
      evaluatedAt: now
    });

    try {
      await withTimeout(
        persistence.persistExecution({
          request: parsed.data,
          requestHash,
          executionId,
          httpStatusCode,
          response,
          nextState,
          now
        }),
        config.REQUEST_TIMEOUT_MS,
        () => new TimeoutError("Execution persistence timed out")
      );
    } catch (error) {
      request.log.error(
        { err: error, request_id: parsed.data.request_id, execution_id: executionId },
        "Execution persistence failed"
      );
      return sendError(reply, 503, "PERSISTENCE_UNAVAILABLE", "Failed to persist execution state");
    }

    return reply.code(httpStatusCode).send(response);
  });
}
