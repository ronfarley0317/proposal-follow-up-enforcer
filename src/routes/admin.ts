import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config.js";
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
