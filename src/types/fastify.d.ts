import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
    requestContext?: {
      requestId: string;
      idempotencyKey: string;
      orchestrator: string;
      workflowId?: string;
      receivedAt: string;
    };
  }
}
