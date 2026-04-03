import type { FastifyRequest } from "fastify";

export function attachRequestContext<TRequest extends FastifyRequest>(request: TRequest) {
  const requestId = request.headers["x-request-id"];
  const idempotencyKey = request.headers["x-idempotency-key"];
  const orchestrator = request.headers["x-orchestrator"];
  const workflowId = request.headers["x-orchestrator-workflow-id"];

  request.requestContext = {
    requestId: typeof requestId === "string" ? requestId : request.id,
    idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : "missing",
    orchestrator: typeof orchestrator === "string" ? orchestrator : "unknown",
    receivedAt: new Date().toISOString(),
    ...(typeof workflowId === "string" ? { workflowId } : {})
  };
}
