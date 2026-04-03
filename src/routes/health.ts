import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config.js";

export async function registerHealthRoute(app: FastifyInstance<any, any, any, any>, config: AppConfig) {
  app.get("/health", async () => ({
    status: "ok",
    service: config.SERVICE_NAME,
    agent_id: config.AGENT_ID,
    agent_version: config.AGENT_VERSION,
    api_version: config.API_VERSION,
    timestamp: new Date().toISOString()
  }));
}
