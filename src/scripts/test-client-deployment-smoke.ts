import assert from "node:assert/strict";

import { buildValidRequest, createTestHarness, injectSignedAdminRequest, injectSignedRequest, parseJson, parseValidatedRuntimeResponse } from "./helpers/test-helpers.js";

async function main() {
  const harness = await createTestHarness();
  const now = new Date();

  try {
    const healthResponse = await harness.app.inject({
      method: "GET",
      url: "/health"
    });
    assert.equal(healthResponse.statusCode, 200);

    const readyResponse = await harness.app.inject({
      method: "GET",
      url: "/ready"
    });
    assert.equal(readyResponse.statusCode, 200);

    const request = buildValidRequest(now);
    request.idempotency_key = "proposal_smoke_001:24h";
    request.request_id = "req_smoke_001";
    request.entity.entity_id = "proposal_smoke_001";
    request.inputs.normalized_payload.proposal_id = "proposal_smoke_001";

    const firstDecision = parseValidatedRuntimeResponse(
      await injectSignedRequest({
        harness,
        body: request
      })
    );
    assert.equal(firstDecision.response_type, "success");
    assert.equal(firstDecision.decision.decision_code, "QUEUE_FOLLOW_UP_1");

    const replayDecision = parseValidatedRuntimeResponse(
      await injectSignedRequest({
        harness,
        body: request
      })
    );
    assert.equal(replayDecision.execution_id, firstDecision.execution_id);

    const executionLookup = await injectSignedAdminRequest({
      harness,
      url: `/api/v1/executions/${firstDecision.execution_id}`
    });
    assert.equal(executionLookup.statusCode, 200);

    const proposalStateLookup = await injectSignedAdminRequest({
      harness,
      url: "/api/v1/proposals/proposal_smoke_001/state"
    });
    assert.equal(proposalStateLookup.statusCode, 200);
    const proposalState = parseJson<{
      currentFollowUpStage: string;
      lastDecisionCode: string | null;
      touchCounter: number;
    }>(proposalStateLookup);
    assert.equal(proposalState.currentFollowUpStage, "stage_1");
    assert.equal(proposalState.lastDecisionCode, "QUEUE_FOLLOW_UP_1");
    assert.equal(proposalState.touchCounter, 1);

    const diagnosticsLookup = await injectSignedAdminRequest({
      harness,
      url: "/api/v1/proposals/proposal_smoke_001/diagnostics"
    });
    assert.equal(diagnosticsLookup.statusCode, 200);
    const diagnostics = parseJson<{
      headline: string;
      response_type: string;
      recommended_next_step: string;
    }>(diagnosticsLookup);
    assert.equal(diagnostics.response_type, "success");
    assert.equal(diagnostics.headline, "Follow-up action was queued");
    assert.ok(diagnostics.recommended_next_step.length > 0);

    const idempotencyLookup = await injectSignedAdminRequest({
      harness,
      url: `/api/v1/idempotency/${encodeURIComponent(request.idempotency_key)}`
    });
    assert.equal(idempotencyLookup.statusCode, 200);

    console.log("Client deployment smoke test passed");
  } finally {
    await harness.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
