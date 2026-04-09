import assert from "node:assert/strict";

import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";
import type {
  IdempotencyLookupResult,
  PersistenceAdapter,
  PersistExecutionInput,
  StoredExecutionRecord,
  StoredIdempotencyRecord,
  StoredProposalState
} from "../persistence/types.js";
import { buildValidRequest, createTestHarness, injectSignedRequest, parseJson, parseValidatedRuntimeResponse } from "./helpers/test-helpers.js";

class FailingPersistenceAdapter implements PersistenceAdapter {
  async init() {}
  async healthCheck() {
    return false;
  }
  async getSchemaVersion(): Promise<number> {
    throw new Error("persistence down");
  }
  async getIdempotencyResult(): Promise<IdempotencyLookupResult> {
    throw new Error("persistence down");
  }
  async findExecutionById(): Promise<StoredExecutionRecord | null> {
    throw new Error("persistence down");
  }
  async findIdempotencyRecord(): Promise<StoredIdempotencyRecord | null> {
    throw new Error("persistence down");
  }
  async getProposalState(): Promise<StoredProposalState | null> {
    throw new Error("persistence down");
  }
  async persistExecution(_input: PersistExecutionInput) {
    throw new Error("persistence down");
  }
  async close() {}
}

async function main() {
  const harness = await createTestHarness();

  try {
    const retryRequest = buildValidRequest();
    retryRequest.idempotency_key = "proposal_123:retry";
    const firstResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: retryRequest })
    );
    const secondResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: retryRequest })
    );
    assert.equal(firstResponse.execution_id, secondResponse.execution_id);

    const dryRunRequest = buildValidRequest();
    dryRunRequest.idempotency_key = "proposal_123:dry-run-repeat";
    dryRunRequest.request_id = "req_dry_run_repeat";
    dryRunRequest.options = {
      ...(dryRunRequest.options ?? {}),
      dry_run: true
    };
    const firstDryRunResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: dryRunRequest })
    );
    const secondDryRunResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: dryRunRequest })
    );
    assert.notEqual(firstDryRunResponse.execution_id, secondDryRunResponse.execution_id);
    assert.equal(firstDryRunResponse.meta.dry_run, true);
    assert.equal(secondDryRunResponse.meta.dry_run, true);

    const conflictingRequest = buildValidRequest();
    conflictingRequest.idempotency_key = "proposal_123:conflict";
    const originalConflictResponse = await injectSignedRequest({ harness, body: conflictingRequest });
    assert.equal(originalConflictResponse.statusCode, 200);
    conflictingRequest.inputs.normalized_payload.proposal_value = 9999;
    const conflictingResponse = await injectSignedRequest({ harness, body: conflictingRequest });
    assert.equal(conflictingResponse.statusCode, 409);
    assert.equal(
      parseValidatedRuntimeResponse(conflictingResponse).errors[0]?.error_code,
      "IDEMPOTENCY_CONFLICT"
    );

    const failingConfig = loadConfig({
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
      SQLITE_DB_PATH: "./data/unused.db",
      REQUEST_TIMEOUT_MS: "1000",
      READINESS_TIMEOUT_MS: "500",
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
      TRUST_PROXY: "false"
    });

    const failingApp = await buildApp(failingConfig, createLogger(failingConfig), new FailingPersistenceAdapter());
    await failingApp.ready();

    try {
      const persistenceDownResponse = await failingApp.inject({
        method: "GET",
        url: "/ready"
      });
      assert.equal(persistenceDownResponse.statusCode, 503);

      const persistenceErrorOnDecide = await injectSignedRequest({
        harness: {
          ...harness,
          app: failingApp,
          config: failingConfig,
          persistence: new FailingPersistenceAdapter(),
          cleanup: async () => {}
        },
        body: buildValidRequest()
      });
      assert.equal(persistenceErrorOnDecide.statusCode, 503);
      assert.equal(parseJson<{ error_code: string }>(persistenceErrorOnDecide).error_code, "PERSISTENCE_UNAVAILABLE");
    } finally {
      await failingApp.close();
    }

    const noAiHarness = await createTestHarness({
      AI_DRAFTING_ENABLED: "false"
    });
    const aiHarness = await createTestHarness({
      AI_DRAFTING_ENABLED: "true",
      OPENAI_API_KEY: "dummy-key"
    });

    try {
      const baseRequest = buildValidRequest();
      baseRequest.idempotency_key = "proposal_123:ai-off";
      const noAiResponse = parseValidatedRuntimeResponse(
        await injectSignedRequest({ harness: noAiHarness, body: baseRequest })
      );

      const aiRequest = buildValidRequest();
      aiRequest.idempotency_key = "proposal_123:ai-on";
      const aiResponse = parseValidatedRuntimeResponse(
        await injectSignedRequest({ harness: aiHarness, body: aiRequest })
      );

      assert.equal(noAiResponse.response_type, aiResponse.response_type);
      assert.equal(noAiResponse.decision.decision_code, aiResponse.decision.decision_code);
      assert.deepEqual(noAiResponse.meta.message_drafts, aiResponse.meta.message_drafts);
    } finally {
      await noAiHarness.cleanup();
      await aiHarness.cleanup();
    }

    console.log("Failure mode tests passed");
  } finally {
    await harness.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
