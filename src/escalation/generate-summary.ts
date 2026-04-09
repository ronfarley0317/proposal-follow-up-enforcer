import type { RuntimeRequest } from "../contracts/runtime-request.js";
import type { RuntimeResponse } from "../contracts/runtime-response.js";

type EscalationSummary = NonNullable<RuntimeResponse["meta"]["escalation_summary"]>;

export function generateEscalationSummary(params: {
  request: RuntimeRequest;
  response: Pick<RuntimeResponse, "response_type" | "decision" | "action" | "routing">;
}): EscalationSummary | undefined {
  const { request, response } = params;
  const payload = request.inputs.normalized_payload;

  if (response.response_type !== "escalated" && response.response_type !== "pending_human") {
    return undefined;
  }

  const headline =
    response.response_type === "escalated"
      ? `Escalation needed for ${payload.contact_name}`
      : `Human review needed for ${payload.contact_name}`;

  const keyFacts = [
    `Proposal value: ${formatMoney(payload.proposal_value, payload.currency)}`,
    `Status: ${payload.proposal_status}`,
    `Service: ${payload.service_category}`,
    `Current stage: ${payload.follow_up_stage}`
  ];

  if (payload.last_response_at) {
    keyFacts.push(`Last prospect reply: ${payload.last_response_at}`);
  }

  if (payload.proposal_viewed_at) {
    keyFacts.push(`Last proposal view: ${payload.proposal_viewed_at}`);
  }

  const ownerBrief =
    response.response_type === "escalated"
      ? `${payload.contact_name} has a ${formatMoney(payload.proposal_value, payload.currency)} proposal that remains unresolved and now requires owner attention. Decision: ${response.decision.decision_label}.`
      : `${payload.contact_name} triggered a review path instead of automated outreach. Decision: ${response.decision.decision_label}.`;

  const recommendedNextStep = inferNextStep(response, payload.owner_name);

  return {
    headline,
    owner_brief: ownerBrief,
    key_facts: keyFacts,
    recommended_next_step: recommendedNextStep
  };
}

function inferNextStep(
  response: Pick<RuntimeResponse, "response_type" | "decision">,
  ownerName: string
) {
  if (response.response_type === "escalated") {
    return `${ownerName} should review the account and send a direct owner follow-up.`;
  }

  if (response.decision.decision_code === "REVIEW_REPLY_INTERESTED") {
    return `${ownerName} should respond directly while the prospect is engaged.`;
  }

  if (response.decision.decision_code === "REVIEW_REPLY_OBJECTION") {
    return `${ownerName} should address the objection before more automation runs.`;
  }

  return `${ownerName} should review the proposal manually before the next outreach step.`;
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
