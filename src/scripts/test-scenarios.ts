import assert from "node:assert/strict";

import { buildValidRequest, createTestHarness, injectSignedRequest, parseValidatedRuntimeResponse } from "./helpers/test-helpers.js";

async function main() {
  const harness = await createTestHarness();

  try {
    const wonRequest = buildValidRequest();
    wonRequest.inputs.normalized_payload.proposal_status = "won";
    wonRequest.idempotency_key = "proposal_123:won";
    const wonResponse = parseValidatedRuntimeResponse(await injectSignedRequest({ harness, body: wonRequest }));
    assert.equal(wonResponse.response_type, "suppressed");

    const recentReplyRequest = buildValidRequest();
    recentReplyRequest.idempotency_key = "proposal_123:recent-reply";
    recentReplyRequest.inputs.normalized_payload.last_response_at = "2026-04-02T10:00:00.000Z";
    const recentReplyResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: recentReplyRequest })
    );
    assert.equal(recentReplyResponse.response_type, "suppressed");

    const silent24hRequest = buildValidRequest();
    silent24hRequest.idempotency_key = "proposal_123:24h";
    const silent24hResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: silent24hRequest })
    );
    assert.equal(silent24hResponse.response_type, "success");

    const silent72hRequest = buildValidRequest();
    silent72hRequest.idempotency_key = "proposal_123:72h";
    silent72hRequest.trigger.trigger_type = "proposal_silence_72h";
    silent72hRequest.inputs.normalized_payload.sent_at = "2026-03-30T10:00:00.000Z";
    silent72hRequest.inputs.normalized_payload.last_outreach_at = "2026-03-30T10:00:00.000Z";
    silent72hRequest.inputs.normalized_payload.follow_up_stage = "stage_1";
    const silent72hResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: silent72hRequest })
    );
    assert.equal(silent72hResponse.response_type, "success");

    const escalatedRequest = buildValidRequest();
    escalatedRequest.idempotency_key = "proposal_123:escalated";
    escalatedRequest.inputs.normalized_payload.proposal_value = 8000;
    escalatedRequest.inputs.normalized_payload.sent_at = "2026-03-29T10:00:00.000Z";
    escalatedRequest.inputs.normalized_payload.last_outreach_at = "2026-03-29T10:00:00.000Z";
    const escalatedResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: escalatedRequest })
    );
    assert.equal(escalatedResponse.response_type, "escalated");

    const pendingHumanRequest = buildValidRequest();
    pendingHumanRequest.idempotency_key = "proposal_123:pending-human";
    pendingHumanRequest.inputs.normalized_payload.proposal_value = 20000;
    pendingHumanRequest.inputs.normalized_payload.sent_at = "2026-04-01T10:00:00.000Z";
    pendingHumanRequest.inputs.normalized_payload.last_outreach_at = "2026-04-01T10:00:00.000Z";
    const pendingHumanResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: pendingHumanRequest })
    );
    assert.equal(pendingHumanResponse.response_type, "pending_human");

    const invalidPayloadRequest = buildValidRequest();
    invalidPayloadRequest.idempotency_key = "proposal_123:failed";
    invalidPayloadRequest.inputs.normalized_payload.sent_at = "2026-04-03T10:00:00.000Z";
    const invalidPayloadResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: invalidPayloadRequest })
    );
    assert.equal(invalidPayloadResponse.response_type, "failed");

    console.log("Scenario tests passed");
  } finally {
    await harness.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
