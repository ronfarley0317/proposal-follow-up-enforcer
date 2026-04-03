import assert from "node:assert/strict";

import { createTestHarness, buildValidRequest, injectSignedRequest, parseValidatedRuntimeResponse, parseJson } from "./helpers/test-helpers.js";

async function main() {
  const harness = await createTestHarness();

  try {
    const validRequest = buildValidRequest();

    const validResponse = await injectSignedRequest({
      harness,
      body: validRequest
    });
    assert.equal(validResponse.statusCode, 200);
    const validatedResponse = parseValidatedRuntimeResponse(validResponse);
    assert.equal(validatedResponse.meta.dry_run, false);

    const dryRunRequest = buildValidRequest();
    dryRunRequest.request_id = "req_dry_run_001";
    dryRunRequest.idempotency_key = "proposal_123:dry-run";
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

    const missingFieldRequest = buildValidRequest();
    delete (missingFieldRequest.inputs.normalized_payload as Record<string, unknown>).contact_id;
    const missingFieldResponse = await injectSignedRequest({
      harness,
      body: missingFieldRequest
    });
    assert.equal(missingFieldResponse.statusCode, 422);
    assert.equal(parseJson<{ error_code: string }>(missingFieldResponse).error_code, "MISSING_REQUIRED_FIELDS");

    const unsupportedVersionRequest = buildValidRequest();
    unsupportedVersionRequest.api_version = "2.0";
    const unsupportedVersionResponse = await injectSignedRequest({
      harness,
      body: unsupportedVersionRequest
    });
    assert.equal(unsupportedVersionResponse.statusCode, 422);
    assert.equal(parseJson<{ error_code: string }>(unsupportedVersionResponse).error_code, "UNSUPPORTED_API_VERSION");

    const invalidAgentRequest = buildValidRequest();
    invalidAgentRequest.agent.agent_id = "invoice-enforcer";
    const invalidAgentResponse = await injectSignedRequest({
      harness,
      body: invalidAgentRequest
    });
    assert.equal(invalidAgentResponse.statusCode, 422);
    assert.equal(parseJson<{ error_code: string }>(invalidAgentResponse).error_code, "INVALID_AGENT_ID");

    console.log("Contract tests passed");
  } finally {
    await harness.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
