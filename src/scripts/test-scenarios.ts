import assert from "node:assert/strict";

import { buildValidRequest, createTestHarness, injectSignedRequest, parseValidatedRuntimeResponse } from "./helpers/test-helpers.js";

async function main() {
  const harness = await createTestHarness();
  const now = new Date();

  try {
    const wonRequest = buildValidRequest(now);
    wonRequest.inputs.normalized_payload.proposal_status = "won";
    wonRequest.idempotency_key = "proposal_123:won";
    const wonResponse = parseValidatedRuntimeResponse(await injectSignedRequest({ harness, body: wonRequest }));
    assert.equal(wonResponse.response_type, "suppressed");
    assert.equal(wonResponse.meta.message_drafts, undefined);

    const recentReplyRequest = buildValidRequest(now);
    recentReplyRequest.idempotency_key = "proposal_123:recent-reply";
    recentReplyRequest.inputs.normalized_payload.last_response_at = new Date(
      now.getTime() - 4 * 60 * 60 * 1000
    ).toISOString();
    const recentReplyResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: recentReplyRequest })
    );
    assert.equal(recentReplyResponse.response_type, "suppressed");
    assert.equal(recentReplyResponse.meta.risk_score?.level, "low");

    const interestedReplyRequest = buildValidRequest(now);
    interestedReplyRequest.idempotency_key = "proposal_123:reply-interested";
    interestedReplyRequest.inputs.normalized_payload.last_response_at = new Date(
      now.getTime() - 2 * 60 * 60 * 1000
    ).toISOString();
    interestedReplyRequest.inputs.normalized_payload.last_reply_text = "This looks good. What are the next steps?";
    const interestedReplyResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: interestedReplyRequest })
    );
    assert.equal(interestedReplyResponse.response_type, "pending_human");
    assert.equal(interestedReplyResponse.decision.decision_code, "REVIEW_REPLY_INTERESTED");
    assert.equal(interestedReplyResponse.meta.risk_score?.level, "medium");

    const closedReplyRequest = buildValidRequest(now);
    closedReplyRequest.idempotency_key = "proposal_123:reply-closed";
    closedReplyRequest.inputs.normalized_payload.last_reply_text = "Approved. Let's move forward.";
    const closedReplyResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: closedReplyRequest })
    );
    assert.equal(closedReplyResponse.response_type, "suppressed");
    assert.equal(closedReplyResponse.decision.decision_code, "SUPPRESS_REPLY_CLOSED");

    const silent24hRequest = buildValidRequest(now);
    silent24hRequest.idempotency_key = "proposal_123:24h";
    const silent24hResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: silent24hRequest })
    );
    assert.equal(silent24hResponse.response_type, "success");
    assert.equal(silent24hResponse.meta.message_drafts?.action_type, "follow_up_1_email");

    const silent72hRequest = buildValidRequest(now);
    silent72hRequest.idempotency_key = "proposal_123:72h";
    silent72hRequest.trigger.trigger_type = "proposal_silence_72h";
    silent72hRequest.inputs.normalized_payload.sent_at = new Date(
      now.getTime() - 80 * 60 * 60 * 1000
    ).toISOString();
    silent72hRequest.inputs.normalized_payload.last_outreach_at = new Date(
      now.getTime() - 80 * 60 * 60 * 1000
    ).toISOString();
    silent72hRequest.inputs.normalized_payload.follow_up_stage = "stage_1";
    const silent72hResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: silent72hRequest })
    );
    assert.equal(silent72hResponse.response_type, "success");
    assert.equal(silent72hResponse.meta.message_drafts?.action_type, "follow_up_2_email");
    assert.equal(silent72hResponse.meta.risk_score?.level, "medium");

    const escalatedRequest = buildValidRequest(now);
    escalatedRequest.idempotency_key = "proposal_123:escalated";
    escalatedRequest.inputs.normalized_payload.proposal_value = 8000;
    escalatedRequest.inputs.normalized_payload.sent_at = new Date(
      now.getTime() - 96 * 60 * 60 * 1000
    ).toISOString();
    escalatedRequest.inputs.normalized_payload.last_outreach_at = new Date(
      now.getTime() - 96 * 60 * 60 * 1000
    ).toISOString();
    const escalatedResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: escalatedRequest })
    );
    assert.equal(escalatedResponse.response_type, "escalated");
    assert.equal(escalatedResponse.meta.message_drafts, undefined);
    assert.equal(escalatedResponse.meta.escalation_summary?.headline, "Escalation needed for Jane Buyer");
    assert.ok(escalatedResponse.meta.escalation_summary?.key_facts.some((fact) => fact.includes("$8,000.00")));
    assert.equal(escalatedResponse.meta.risk_score?.level, "high");

    const pendingHumanRequest = buildValidRequest(now);
    pendingHumanRequest.idempotency_key = "proposal_123:pending-human";
    pendingHumanRequest.inputs.normalized_payload.proposal_value = 20000;
    pendingHumanRequest.inputs.normalized_payload.sent_at = new Date(
      now.getTime() - 48 * 60 * 60 * 1000
    ).toISOString();
    pendingHumanRequest.inputs.normalized_payload.last_outreach_at = new Date(
      now.getTime() - 48 * 60 * 60 * 1000
    ).toISOString();
    const pendingHumanResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: pendingHumanRequest })
    );
    assert.equal(pendingHumanResponse.response_type, "pending_human");
    assert.equal(
      pendingHumanResponse.meta.escalation_summary?.headline,
      "Human review needed for Jane Buyer"
    );
    assert.equal(pendingHumanResponse.meta.risk_score?.level, "high");

    const invalidPayloadRequest = buildValidRequest(now);
    invalidPayloadRequest.idempotency_key = "proposal_123:failed";
    invalidPayloadRequest.inputs.normalized_payload.sent_at = new Date(
      now.getTime() + 60 * 60 * 1000
    ).toISOString();
    const invalidPayloadResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: invalidPayloadRequest })
    );
    assert.equal(invalidPayloadResponse.response_type, "failed");
    assert.equal(invalidPayloadResponse.meta.escalation_summary, undefined);
    assert.equal(invalidPayloadResponse.meta.risk_score?.level, "low");

    console.log("Scenario tests passed");
  } finally {
    await harness.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
