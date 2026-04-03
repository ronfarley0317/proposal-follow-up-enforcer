import Fastify from "fastify";
import fastifyRawBody from "fastify-raw-body";
import type { Logger } from "pino";

import type { AppConfig } from "./config.js";
import { sendError } from "./errors.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { attachRequestContext } from "./middleware/request-context.js";
import type { PersistenceAdapter } from "./persistence/types.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerDecideRoute } from "./routes/decide.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerReadyRoute } from "./routes/ready.js";

export async function buildApp(config: AppConfig, logger: Logger, persistence: PersistenceAdapter) {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: config.TRUST_PROXY,
    bodyLimit: config.REQUEST_MAX_BODY_BYTES,
    requestIdHeader: "x-request-id",
    disableRequestLogging: true,
    requestTimeout: config.REQUEST_TIMEOUT_MS,
    keepAliveTimeout: config.KEEP_ALIVE_TIMEOUT_MS
  });

  await app.register(fastifyRawBody, {
    field: "rawBody",
    global: true,
    encoding: "utf8",
    runFirst: true
  });

  app.addHook("onRequest", async (request) => {
    attachRequestContext(request);
    request.log.info(
      {
        request_id: request.requestContext?.requestId,
        idempotency_key: request.requestContext?.idempotencyKey,
        method: request.method,
        url: request.url
      },
      "Request received"
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        request_id: request.requestContext?.requestId,
        idempotency_key: request.requestContext?.idempotencyKey,
        status_code: reply.statusCode,
        response_time_ms: reply.elapsedTime
      },
      "Request completed"
    );
  });

  const authMiddleware = createAuthMiddleware(config);

  app.addHook("preValidation", async (request, reply) => {
    const requiresAuth =
      request.url.startsWith("/api/v1/decide") ||
      request.url.startsWith("/api/v1/executions/") ||
      request.url.startsWith("/api/v1/proposals/") ||
      request.url.startsWith("/api/v1/idempotency/");

    if (requiresAuth) {
      return authMiddleware(request, reply);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error");

    if (reply.sent) {
      return;
    }

    if ((error as { code?: string }).code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      return sendError(reply, 400, "JSON_INVALID", "Request body contains invalid JSON");
    }

    if ((error as { code?: string }).code === "FST_ERR_HOOK_TIMEOUT") {
      return sendError(reply, 504, "REQUEST_TIMEOUT", "Request processing timed out");
    }

    return sendError(reply, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error");
  });

  await registerHealthRoute(app, config);
  await registerReadyRoute(app, config, persistence);
  await registerDecideRoute(app, config, persistence);
  await registerAdminRoutes(app, config, persistence);

  return app;
}
