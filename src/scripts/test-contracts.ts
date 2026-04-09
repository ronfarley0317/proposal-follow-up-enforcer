import assert from "node:assert/strict";

import {
  createTestHarness,
  buildValidRequest,
  injectSignedRequest,
  injectSignedAdminRequest,
  parseValidatedRuntimeResponse,
  parseJson
} from "./helpers/test-helpers.js";

async function main() {
  const harness = await createTestHarness();
  const now = new Date();

  try {
    const validRequest = buildValidRequest(now);

    const validResponse = await injectSignedRequest({
      harness,
      body: validRequest
    });
    assert.equal(validResponse.statusCode, 200);
    const validatedResponse = parseValidatedRuntimeResponse(validResponse);
    assert.equal(validatedResponse.meta.dry_run, false);
    assert.equal(validatedResponse.meta.message_drafts?.source, "deterministic_template");
    assert.equal(validatedResponse.meta.message_drafts?.variants.length, 3);

    const dryRunRequest = buildValidRequest(now);
    dryRunRequest.request_id = "req_dry_run_001";
    dryRunRequest.idempotency_key = "proposal_123:dry-run";
    dryRunRequest.entity.entity_id = "proposal_dry_run_001";
    dryRunRequest.entity.account_id = "acct_dry_run_001";
    dryRunRequest.inputs.normalized_payload.proposal_id = "proposal_dry_run_001";
    dryRunRequest.inputs.normalized_payload.account_id = "acct_dry_run_001";
    dryRunRequest.options = {
      ...(dryRunRequest.options ?? {}),
      dry_run: true
    };
    const dryRunResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({
        harness,
        body: dryRunRequest
      })
    );
    assert.equal(dryRunResponse.meta.dry_run, true);
    assert.equal(dryRunResponse.meta.message_drafts?.recommended_variant_id, "warm");

    const rawCrmRequest = buildValidRequest(now);
    rawCrmRequest.request_id = "req_crm_raw_001";
    rawCrmRequest.idempotency_key = "proposal_crm_001:raw";
    rawCrmRequest.entity.entity_id = "proposal_crm_001";
    rawCrmRequest.entity.account_id = "acct_crm_001";
    const normalizedPayload = rawCrmRequest.inputs.normalized_payload;
    const rawBodyRequest = {
      ...rawCrmRequest,
      inputs: {
        raw_payload: {
          proposalId: "proposal_crm_001",
          accountId: "acct_crm_001",
          contactId: normalizedPayload.contact_id,
          customer_name: normalizedPayload.contact_name,
          customer_email: normalizedPayload.contact_email,
          amount: "$4200",
          currency_code: "usd",
          sentAt: normalizedPayload.sent_at,
          status: normalizedPayload.proposal_status,
          ownerId: normalizedPayload.owner_id,
          ownerName: normalizedPayload.owner_name,
          ownerEmail: normalizedPayload.owner_email,
          lastContactedAt: normalizedPayload.last_outreach_at,
          sequence_stage: normalizedPayload.follow_up_stage,
          quote_url: normalizedPayload.proposal_url,
          lead_source: normalizedPayload.pipeline_source,
          service_type: normalizedPayload.service_category,
          views: "2",
          doNotContact: "false"
        }
      },
      options: {
        dry_run: true,
        require_dashboard_events: true,
        response_detail: "full"
      }
    };
    const rawCrmResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({
        harness,
        body: rawBodyRequest
      })
    );
    assert.equal(rawCrmResponse.response_type, "success");
    assert.equal(rawCrmResponse.action.action_type, "follow_up_1_email");

    const hintedAliasRequest = buildValidRequest(now);
    hintedAliasRequest.request_id = "req_crm_hint_001";
    hintedAliasRequest.idempotency_key = "proposal_crm_002:raw";
    hintedAliasRequest.entity.entity_id = "proposal_crm_002";
    hintedAliasRequest.entity.account_id = "acct_crm_002";
    const hintedRawRequest = {
      ...hintedAliasRequest,
      inputs: {
        raw_payload: {
          custom: {
            proposalRef: "proposal_crm_002",
            lastTouch: hintedAliasRequest.inputs.normalized_payload.last_outreach_at
          },
          companyRef: "acct_crm_002",
          personRef: hintedAliasRequest.inputs.normalized_payload.contact_id,
          personName: hintedAliasRequest.inputs.normalized_payload.contact_name,
          personEmail: hintedAliasRequest.inputs.normalized_payload.contact_email,
          totalPrice: "4200",
          isoCurrency: "USD",
          proposalSent: hintedAliasRequest.inputs.normalized_payload.sent_at,
          lifecycleStatus: hintedAliasRequest.inputs.normalized_payload.proposal_status,
          repRef: hintedAliasRequest.inputs.normalized_payload.owner_id,
          repDisplayName: hintedAliasRequest.inputs.normalized_payload.owner_name,
          repMailbox: hintedAliasRequest.inputs.normalized_payload.owner_email,
          touchStage: hintedAliasRequest.inputs.normalized_payload.follow_up_stage,
          proposalLink: hintedAliasRequest.inputs.normalized_payload.proposal_url,
          sourceLabel: hintedAliasRequest.inputs.normalized_payload.pipeline_source,
          serviceLine: hintedAliasRequest.inputs.normalized_payload.service_category
        },
        normalization_hints: {
          field_aliases: {
            proposal_id: ["custom.proposalRef"],
            account_id: ["companyRef"],
            contact_id: ["personRef"],
            contact_name: ["personName"],
            contact_email: ["personEmail"],
            proposal_value: ["totalPrice"],
            currency: ["isoCurrency"],
            sent_at: ["proposalSent"],
            proposal_status: ["lifecycleStatus"],
            owner_id: ["repRef"],
            owner_name: ["repDisplayName"],
            owner_email: ["repMailbox"],
            last_outreach_at: ["custom.lastTouch"],
            follow_up_stage: ["touchStage"],
            proposal_url: ["proposalLink"],
            pipeline_source: ["sourceLabel"],
            service_category: ["serviceLine"]
          }
        }
      },
      options: {
        dry_run: true,
        require_dashboard_events: true,
        response_detail: "full"
      }
    };
    const hintedAliasResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({
        harness,
        body: hintedRawRequest
      })
    );
    assert.equal(hintedAliasResponse.response_type, "success");

    const classifiedReplyRequest = buildValidRequest(now);
    classifiedReplyRequest.request_id = "req_reply_norm_001";
    classifiedReplyRequest.idempotency_key = "proposal_reply_norm_001:raw";
    classifiedReplyRequest.entity.entity_id = "proposal_reply_norm_001";
    classifiedReplyRequest.entity.account_id = "acct_reply_norm_001";
    const classifiedReplyRawRequest = {
      ...classifiedReplyRequest,
      inputs: {
        raw_payload: {
          proposalId: "proposal_reply_norm_001",
          accountId: "acct_reply_norm_001",
          contactId: classifiedReplyRequest.inputs.normalized_payload.contact_id,
          customer_name: classifiedReplyRequest.inputs.normalized_payload.contact_name,
          customer_email: classifiedReplyRequest.inputs.normalized_payload.contact_email,
          amount: "4200",
          currency_code: "usd",
          sentAt: classifiedReplyRequest.inputs.normalized_payload.sent_at,
          status: classifiedReplyRequest.inputs.normalized_payload.proposal_status,
          ownerId: classifiedReplyRequest.inputs.normalized_payload.owner_id,
          ownerName: classifiedReplyRequest.inputs.normalized_payload.owner_name,
          ownerEmail: classifiedReplyRequest.inputs.normalized_payload.owner_email,
          lastContactedAt: classifiedReplyRequest.inputs.normalized_payload.last_outreach_at,
          sequence_stage: classifiedReplyRequest.inputs.normalized_payload.follow_up_stage,
          quote_url: classifiedReplyRequest.inputs.normalized_payload.proposal_url,
          lead_source: classifiedReplyRequest.inputs.normalized_payload.pipeline_source,
          service_type: classifiedReplyRequest.inputs.normalized_payload.service_category,
          replied_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          reply_text: "This looks good. What are the next steps?"
        }
      },
      options: {
        dry_run: true,
        require_dashboard_events: true,
        response_detail: "full"
      }
    };
    const classifiedReplyResponse = parseValidatedRuntimeResponse(
      await injectSignedRequest({
        harness,
        body: classifiedReplyRawRequest
      })
    );
    assert.equal(classifiedReplyResponse.response_type, "pending_human");
    assert.equal(classifiedReplyResponse.decision.decision_code, "REVIEW_REPLY_INTERESTED");

    const invalidAuthResponse = await injectSignedRequest({
      harness,
      body: validRequest,
      headers: {
        authorization: "Bearer wrong-token"
      }
    });
    assert.equal(invalidAuthResponse.statusCode, 401);
    assert.equal(parseJson<{ error_code: string }>(invalidAuthResponse).error_code, "AUTH_INVALID");

    const invalidSignatureResponse = await injectSignedRequest({
      harness,
      body: validRequest,
      headers: {
        "x-signature": "sha256=invalid"
      }
    });
    assert.equal(invalidSignatureResponse.statusCode, 401);
    assert.equal(parseJson<{ error_code: string }>(invalidSignatureResponse).error_code, "SIGNATURE_INVALID");

    const invalidJsonResponse = await injectSignedRequest({
      harness,
      body: validRequest,
      rawBody: "{\"invalid\":"
    });
    assert.equal(invalidJsonResponse.statusCode, 400);
    assert.equal(parseJson<{ error_code: string }>(invalidJsonResponse).error_code, "JSON_INVALID");

    const missingFieldRequest = buildValidRequest(now);
    delete (missingFieldRequest.inputs.normalized_payload as Record<string, unknown>).contact_id;
    const missingFieldResponse = await injectSignedRequest({
      harness,
      body: missingFieldRequest
    });
    assert.equal(missingFieldResponse.statusCode, 422);
    assert.equal(parseJson<{ error_code: string }>(missingFieldResponse).error_code, "MISSING_REQUIRED_FIELDS");

    const unsupportedVersionRequest = buildValidRequest(now);
    unsupportedVersionRequest.api_version = "2.0";
    const unsupportedVersionResponse = await injectSignedRequest({
      harness,
      body: unsupportedVersionRequest
    });
    assert.equal(unsupportedVersionResponse.statusCode, 422);
    assert.equal(parseJson<{ error_code: string }>(unsupportedVersionResponse).error_code, "UNSUPPORTED_API_VERSION");

    const invalidAgentRequest = buildValidRequest(now);
    invalidAgentRequest.agent.agent_id = "invoice-enforcer";
    const invalidAgentResponse = await injectSignedRequest({
      harness,
      body: invalidAgentRequest
    });
    assert.equal(invalidAgentResponse.statusCode, 422);
    assert.equal(parseJson<{ error_code: string }>(invalidAgentResponse).error_code, "INVALID_AGENT_ID");

    const diagnosticsLookup = await injectSignedAdminRequest({
      harness,
      url: "/api/v1/proposals/proposal_123/diagnostics"
    });
    assert.equal(diagnosticsLookup.statusCode, 200);
    const diagnosticsBody = parseJson<{
      proposal_id: string;
      headline: string;
      blocking_reasons: string[];
      current_state: { last_decision_code: string | null };
      response_summary: { risk_score: { level: string } | null };
    }>(diagnosticsLookup);
    assert.equal(diagnosticsBody.proposal_id, "proposal_123");
    assert.equal(diagnosticsBody.headline, "Follow-up action was queued");
    assert.equal(diagnosticsBody.current_state.last_decision_code, "QUEUE_FOLLOW_UP_1");
    assert.equal(diagnosticsBody.response_summary.risk_score?.level, "low");

    console.log("Contract tests passed");
  } finally {
    await harness.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
