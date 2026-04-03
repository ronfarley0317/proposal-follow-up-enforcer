import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { LightMyRequestResponse } from "fastify";

import { buildApp } from "../../app.js";
import { loadConfig, type AppConfig } from "../../config.js";
import type { RuntimeRequest } from "../../contracts/runtime-request.js";
import { runtimeResponseSchema } from "../../contracts/runtime-response.js";
import { createLogger } from "../../logger.js";
import { createPersistenceAdapter } from "../../persistence/index.js";
import type { PersistenceAdapter } from "../../persistence/types.js";

type TestHarness = {
  app: Awaited<ReturnType<typeof buildApp>>;
  config: AppConfig;
  persistence: PersistenceAdapter;
  cleanup: () => Promise<void>;
};

export async function createTestHarness(overrides: Partial<Record<string, string>> = {}): Promise<TestHarness> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-enforcer-"));
  const dbPath = path.join(tempDir, "runtime.db");

  const config = loadConfig({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "8080",
    LOG_LEVEL: "fatal",
    SERVICE_NAME: "proposal-follow-up-enforcer-runtime-test",
    SERVICE_ENVIRONMENT: "test",
    AGENT_ID: "proposal-follow-up-enforcer",
    AGENT_VERSION: "v1.0.0",
    API_VERSION: "1.0",
    TIMEZONE_DEFAULT: "America/New_York",
    RUNTIME_BEARER_TOKEN: "test-bearer-token-123456",
    RUNTIME_HMAC_SECRET: "test-hmac-secret-123456",
    REQUEST_TIMESTAMP_TOLERANCE_SECONDS: "300",
    REQUEST_MAX_BODY_BYTES: "262144",
    DB_CLIENT: "sqlite",
    SQLITE_DB_PATH: dbPath,
    REQUEST_TIMEOUT_MS: "10000",
    READINESS_TIMEOUT_MS: "2000",
    KEEP_ALIVE_TIMEOUT_MS: "5000",
    FORCE_DEFAULT_SECRETS_ALLOWED: "true",
    AI_DRAFTING_ENABLED: "false",
    FOLLOW_UP_1_DELAY_HOURS: "24",
    FOLLOW_UP_2_DELAY_HOURS: "72",
    CALL_TASK_DELAY_DAYS: "7",
    MAX_AUTOMATED_EMAIL_TOUCHES: "2",
    RECENT_REPLY_SUPPRESSION_HOURS: "72",
    RECENT_OUTREACH_SUPPRESSION_HOURS: "24",
    ESCALATION_VALUE_THRESHOLD: "5000",
    ESCALATION_SILENCE_HOURS: "72",
    HIGH_VALUE_APPROVAL_THRESHOLD: "15000",
    EXPIRY_URGENCY_DAYS: "2",
    LOW_CONFIDENCE_THRESHOLD: "0.6",
    VIEW_INTENT_PRIORITY_WINDOW_HOURS: "24",
    SENSITIVE_SEGMENTS: "vip,strategic,sensitive",
    TRUST_PROXY: "false",
    ...overrides
  });

  const logger = createLogger(config);
  const persistence = await createPersistenceAdapter(config);
  const app = await buildApp(config, logger, persistence);
  await app.ready();

  return {
    app,
    config,
    persistence,
    cleanup: async () => {
      await app.close();
      await persistence.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

export function buildValidRequest(now = new Date("2026-04-02T14:00:00.000Z")): RuntimeRequest {
  const sentAt = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();
  const lastOutreachAt = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();

  return {
    api_version: "1.0",
    request_id: "req_test_001",
    idempotency_key: "proposal_123:proposal_silence_24h:2026-04-02T14",
    sent_at: now.toISOString(),
    orchestrator: {
      name: "n8n",
      workflow_id: "wf_test_001",
      workflow_execution_id: "wfe_test_001",
      node_id: "http_request_1",
      environment: "test"
    },
    agent: {
      agent_id: "proposal-follow-up-enforcer",
      agent_version: "v1.0.0",
      policy_version: "2026-04"
    },
    trigger: {
      trigger_type: "proposal_silence_24h",
      trigger_id: "trg_test_001",
      trigger_time: now.toISOString(),
      source_systems: ["crm", "proposal_platform", "email_log", "n8n"]
    },
    entity: {
      entity_type: "proposal",
      entity_id: "proposal_123",
      customer_id: "cust_001",
      account_id: "acct_001"
    },
    inputs: {
      normalized_payload: {
        proposal_id: "proposal_123",
        account_id: "acct_001",
        contact_id: "contact_001",
        contact_name: "Jane Buyer",
        contact_email: "buyer@example.com",
        proposal_value: 4200,
        currency: "USD",
        sent_at: sentAt,
        proposal_status: "sent",
        owner_id: "owner_001",
        owner_name: "Jane Owner",
        owner_email: "owner@example.com",
        last_outreach_at: lastOutreachAt,
        follow_up_stage: "stage_0",
        proposal_url: "https://example.com/proposals/123",
        pipeline_source: "web_form",
        service_category: "roofing",
        view_count: 0
      }
    },
    options: {
      dry_run: false,
      require_dashboard_events: true,
      response_detail: "full"
    }
  };
}

export function signPayload(payload: string, config: AppConfig, timestamp: string) {
  const signature = crypto
    .createHmac("sha256", config.RUNTIME_HMAC_SECRET)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  return `sha256=${signature}`;
}

export async function injectSignedRequest(params: {
  harness: TestHarness;
  body: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}): Promise<LightMyRequestResponse> {
  const bodyString = params.rawBody ?? JSON.stringify(params.body);
  const timestamp = new Date().toISOString();
  const baseRequest =
    params.body && typeof params.body === "object" && "request_id" in (params.body as Record<string, unknown>)
      ? (params.body as Record<string, unknown>)
      : {};

  return params.harness.app.inject({
    method: "POST",
    url: "/api/v1/decide",
    payload: bodyString,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.harness.config.RUNTIME_BEARER_TOKEN}`,
      "x-request-id": typeof baseRequest.request_id === "string" ? baseRequest.request_id : "req_test_001",
      "x-idempotency-key":
        typeof baseRequest.idempotency_key === "string"
          ? baseRequest.idempotency_key
          : "proposal_123:test",
      "x-orchestrator": "n8n",
      "x-orchestrator-workflow-id": "wf_test_001",
      "x-timestamp": timestamp,
      "x-signature": signPayload(bodyString, params.harness.config, timestamp),
      ...(params.headers ?? {})
    }
  });
}

export function parseJson<T>(response: LightMyRequestResponse): T {
  return JSON.parse(response.body) as T;
}

export function parseValidatedRuntimeResponse(response: LightMyRequestResponse) {
  return runtimeResponseSchema.parse(JSON.parse(response.body));
}
