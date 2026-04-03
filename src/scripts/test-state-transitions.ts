import assert from "node:assert/strict";

import { buildValidRequest, createTestHarness, injectSignedRequest, parseValidatedRuntimeResponse } from "./helpers/test-helpers.js";

async function main() {
  const harness = await createTestHarness();

  try {
    const wonRequest = buildValidRequest();
    wonRequest.idempotency_key = "proposal_123:won-terminal";
    wonRequest.inputs.normalized_payload.proposal_status = "won";
    const wonResponse = parseValidatedRuntimeResponse(await injectSignedRequest({ harness, body: wonRequest }));
    assert.equal(wonResponse.response_type, "suppressed");

    const terminalState = await harness.persistence.getProposalState("proposal_123");
    assert.ok(terminalState);
    assert.equal(terminalState.terminalState, true);
    assert.equal(terminalState.latestKnownProposalStatus, "won");
    assert.equal(terminalState.lastDecisionCode, "SUPPRESS_TERMINAL_STATUS");

    const reopenedRequest = buildValidRequest();
    reopenedRequest.idempotency_key = "proposal_123:reopened";
    reopenedRequest.inputs.normalized_payload.proposal_status = "sent";
    reopenedRequest.inputs.normalized_payload.sent_at = "2026-04-01T08:00:00.000Z";
    reopenedRequest.inputs.normalized_payload.last_outreach_at = "2026-04-01T08:00:00.000Z";
    const reopenedResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: reopenedRequest })
    );
    assert.notEqual(reopenedResponse.response_type, "suppressed");

    const reopenedState = await harness.persistence.getProposalState("proposal_123");
    assert.ok(reopenedState);
    assert.equal(reopenedState.terminalState, false);
    assert.equal(reopenedState.latestKnownProposalStatus, "sent");

    const firstSuccessRequest = buildValidRequest();
    firstSuccessRequest.idempotency_key = "proposal_456:first-success";
    firstSuccessRequest.entity.entity_id = "proposal_456";
    firstSuccessRequest.inputs.normalized_payload.proposal_id = "proposal_456";
    firstSuccessRequest.inputs.normalized_payload.sent_at = "2026-04-01T08:00:00.000Z";
    firstSuccessRequest.inputs.normalized_payload.last_outreach_at = "2026-04-01T08:00:00.000Z";
    const firstSuccessResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: firstSuccessRequest })
    );
    assert.equal(firstSuccessResponse.response_type, "success");
    assert.equal(firstSuccessResponse.decision.decision_code, "QUEUE_FOLLOW_UP_1");

    const duplicateSuccessRequest = buildValidRequest();
    duplicateSuccessRequest.idempotency_key = "proposal_456:repeat-success";
    duplicateSuccessRequest.entity.entity_id = "proposal_456";
    duplicateSuccessRequest.inputs.normalized_payload.proposal_id = "proposal_456";
    duplicateSuccessRequest.inputs.normalized_payload.sent_at = "2026-04-01T08:00:00.000Z";
    duplicateSuccessRequest.inputs.normalized_payload.last_outreach_at = "2026-04-01T08:00:00.000Z";
    const duplicateSuccessResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: duplicateSuccessRequest })
    );
    assert.equal(duplicateSuccessResponse.response_type, "suppressed");
    assert.equal(duplicateSuccessResponse.decision.decision_code, "SUPPRESS_NO_ACTION_DUE");

    const duplicateState = await harness.persistence.getProposalState("proposal_456");
    assert.ok(duplicateState);
    assert.equal(duplicateState.currentFollowUpStage, "stage_1");
    assert.equal(duplicateState.touchCounter, 1);

    const pendingHumanRequest = buildValidRequest();
    pendingHumanRequest.idempotency_key = "proposal_789:pending-human";
    pendingHumanRequest.entity.entity_id = "proposal_789";
    pendingHumanRequest.inputs.normalized_payload.proposal_id = "proposal_789";
    pendingHumanRequest.inputs.normalized_payload.follow_up_stage = "stage_1";
    pendingHumanRequest.inputs.normalized_payload.proposal_value = 20000;
    pendingHumanRequest.inputs.normalized_payload.sent_at = "2026-04-01T08:00:00.000Z";
    pendingHumanRequest.inputs.normalized_payload.last_outreach_at = "2026-04-01T08:00:00.000Z";
    const pendingHumanResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: pendingHumanRequest })
    );
    assert.equal(pendingHumanResponse.response_type, "pending_human");

    const pendingHumanState = await harness.persistence.getProposalState("proposal_789");
    assert.ok(pendingHumanState);
    assert.equal(pendingHumanState.currentFollowUpStage, "stage_1");
    assert.equal(pendingHumanState.touchCounter, 1);
    assert.equal(pendingHumanState.lastEscalationStatus, "pending_human");

    const escalatedRequest = buildValidRequest();
    escalatedRequest.idempotency_key = "proposal_999:escalated";
    escalatedRequest.entity.entity_id = "proposal_999";
    escalatedRequest.inputs.normalized_payload.proposal_id = "proposal_999";
    escalatedRequest.inputs.normalized_payload.follow_up_stage = "stage_2";
    escalatedRequest.inputs.normalized_payload.proposal_value = 8000;
    escalatedRequest.inputs.normalized_payload.sent_at = "2026-03-29T08:00:00.000Z";
    escalatedRequest.inputs.normalized_payload.last_outreach_at = "2026-03-29T08:00:00.000Z";
    const escalatedResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({ harness, body: escalatedRequest })
    );
    assert.equal(escalatedResponse.response_type, "escalated");

    const escalatedState = await harness.persistence.getProposalState("proposal_999");
    assert.ok(escalatedState);
    assert.equal(escalatedState.currentFollowUpStage, "stage_2");
    assert.equal(escalatedState.touchCounter, 2);
    assert.equal(escalatedState.lastEscalationStatus, "escalated");

    console.log("State transition edge-case tests passed");
  } finally {
    await harness.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
