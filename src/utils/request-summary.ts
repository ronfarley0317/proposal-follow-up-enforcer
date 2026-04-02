import type { RuntimeRequest } from "../contracts/runtime-request.js";

export function summarizeDecisionRequest(request: RuntimeRequest) {
  return {
    request_id: request.request_id,
    idempotency_key: request.idempotency_key,
    trigger_type: request.trigger.trigger_type,
    entity_type: request.entity.entity_type,
    entity_id: request.entity.entity_id,
    proposal_id: request.inputs.normalized_payload.proposal_id,
    proposal_status: request.inputs.normalized_payload.proposal_status,
    proposal_value: request.inputs.normalized_payload.proposal_value,
    service_category: request.inputs.normalized_payload.service_category
  };
}
