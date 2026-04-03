import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config.js";
import type { PersistenceAdapter } from "../persistence/types.js";
import { TimeoutError, withTimeout } from "../utils/timeout.js";

export async function registerReadyRoute(
  app: FastifyInstance,
  config: AppConfig,
  persistence: PersistenceAdapter
) {
  app.get("/ready", async (_, reply) => {
    let persistenceReady = false;
    let persistenceError: string | null = null;
    let schemaVersion: number | null = null;

    try {
      persistenceReady = await withTimeout(
        persistence.healthCheck(),
        config.READINESS_TIMEOUT_MS,
        () => new TimeoutError("Persistence health check timed out")
      );
    } catch (error) {
      persistenceError = error instanceof Error ? error.message : "unknown persistence failure";
    }

    if (persistenceReady) {
      try {
        schemaVersion = await withTimeout(
          persistence.getSchemaVersion(),
          config.READINESS_TIMEOUT_MS,
          () => new TimeoutError("Schema version lookup timed out")
        );
      } catch (error) {
        persistenceReady = false;
        persistenceError = error instanceof Error ? error.message : "unknown schema version failure";
      }
    }

    const aiDependencyReady =
      config.AI_DRAFTING_ENABLED === false ||
      Boolean(config.OPENAI_API_KEY || config.ANTHROPIC_API_KEY);

    const ready = persistenceReady && aiDependencyReady;
    const payload = {
      status: ready ? "ready" : "not_ready",
      service: config.SERVICE_NAME,
      checks: {
        config_loaded: true,
        auth_configured: true,
        persistence_configured: persistenceReady,
        schema_version: schemaVersion,
        decision_engine_loaded: true,
        ai_drafting_configured: aiDependencyReady
      },
      dependency_errors: {
        persistence: persistenceError
      },
      timestamp: new Date().toISOString()
    };

    return reply.code(ready ? 200 : 503).send(payload);
  });
}
