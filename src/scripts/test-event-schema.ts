import "dotenv/config";

import { loadConfig } from "../config.js";
import { enforcementEventSchema } from "../contracts/enforcement-event.js";
import { buildRuntimeResponseFromDecision } from "../responses.js";
import { buildDashboardEvents } from "../events/builder.js";
import type { RuntimeRequest } from "../contracts/runtime-request.js";
import type { DecisionResult } from "../decision-engine/types.js";

const request: RuntimeRequest = {
  api_version: "1.0",
  request_id: "req_test_001",
  idempotency_key: "proposal_123:test",
  sent_at: "2026-04-02T14:00:00.000Z",
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
    trigger_type: "proposal_silence_72h",
    trigger_id: "trg_test_001",
    trigger_time: "2026-04-02T13:59:00.000Z",
    source_systems: ["crm", "n8n"]
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
      sent_at: "2026-03-30T14:00:00.000Z",
      proposal_status: "sent",
      owner_id: "owner_001",
      owner_name: "Jane Owner",
      owner_email: "owner@example.com",
      last_outreach_at: "2026-03-31T14:00:00.000Z",
      follow_up_stage: "stage_1",
      proposal_url: "https://example.com/proposals/123",
      pipeline_source: "web_form",
      service_category: "roofing",
      view_count: 2,
      days_to_expiry: 5
    }
  },
  options: {
    dry_run: false,
    require_dashboard_events: true,
    response_detail: "full"
  }
};

const decisionFixtures: DecisionResult[] = [
  {
    responseType: "success",
    decisionCode: "QUEUE_FOLLOW_UP_2",
    decisionLabel: "Queue second follow-up email",
    decisionConfidence: 0.9,
    reasonCodes: ["FOLLOW_UP_2_WINDOW_REACHED"],
    leakageCondition: "silent_proposal_decay",
    actionType: "follow_up_2_email",
    actionStatus: "queued",
    actionChannel: "email",
    actionTarget: "buyer@example.com",
    route: "action",
    priority: "normal",
    humanReviewRequired: false,
    escalationRequired: false,
    errors: [],
    terminal: false
  },
  {
    responseType: "suppressed",
    decisionCode: "SUPPRESS_RECENT_REPLY",
    decisionLabel: "Suppress follow-up because a recent prospect reply was detected",
    decisionConfidence: 0.97,
    reasonCodes: ["RECENT_REPLY_DETECTED"],
    leakageCondition: "silent_proposal_decay",
    actionType: null,
    actionStatus: "suppressed",
    actionChannel: null,
    actionTarget: null,
    route: "suppress",
    priority: "normal",
    humanReviewRequired: false,
    escalationRequired: false,
    errors: [],
    terminal: false
  },
  {
    responseType: "escalated",
    decisionCode: "ESCALATE_HIGH_VALUE_SILENCE",
    decisionLabel: "Escalate high-value silent proposal to owner",
    decisionConfidence: 0.93,
    reasonCodes: ["HIGH_VALUE_PROPOSAL", "SILENCE_THRESHOLD_EXCEEDED"],
    leakageCondition: "silent_proposal_decay",
    actionType: "owner_notification",
    actionStatus: "escalated",
    actionChannel: "internal_notification",
    actionTarget: "owner@example.com",
    route: "escalation",
    priority: "high",
    humanReviewRequired: true,
    escalationRequired: true,
    errors: [],
    terminal: false
  },
  {
    responseType: "pending_human",
    decisionCode: "REVIEW_HIGH_VALUE_PROPOSAL",
    decisionLabel: "Require human review because proposal value exceeds approval threshold",
    decisionConfidence: 0.55,
    reasonCodes: ["APPROVAL_THRESHOLD_EXCEEDED", "HIGH_VALUE_PROPOSAL"],
    leakageCondition: "silent_proposal_decay",
    actionType: "owner_notification",
    actionStatus: "awaiting_human",
    actionChannel: "internal_review",
    actionTarget: "owner@example.com",
    route: "human_review",
    priority: "high",
    humanReviewRequired: true,
    escalationRequired: false,
    errors: [],
    terminal: false
  },
  {
    responseType: "failed",
    decisionCode: "INVALID_PROPOSAL_TIMELINE",
    decisionLabel: "Fail evaluation because sent_at is in the future",
    decisionConfidence: 0,
    reasonCodes: ["INVALID_TIMELINE", "SENT_AT_IN_FUTURE"],
    leakageCondition: "silent_proposal_decay",
    actionType: null,
    actionStatus: "failed",
    actionChannel: null,
    actionTarget: null,
    route: "failure",
    priority: "high",
    humanReviewRequired: false,
    escalationRequired: false,
    errors: [
      {
        error_code: "INVALID_PROPOSAL_TIMELINE",
        error_message: "sent_at cannot be in the future for deterministic follow-up evaluation.",
        retryable: false,
        field: "inputs.normalized_payload.sent_at"
      }
    ],
    terminal: true
  }
];

async function main() {
  const config = loadConfig();
  for (const [index, decisionResult] of decisionFixtures.entries()) {
    const executionId = `exec_test_00${index + 1}`;
    const response = buildRuntimeResponseFromDecision({
      config,
      request,
      executionId,
      result: decisionResult
    });
    const events = buildDashboardEvents({
      config,
      request,
      response,
      decisionResult,
      executionId,
      eventTime: new Date("2026-04-02T14:00:00.000Z")
    });

    for (const event of events) {
      enforcementEventSchema.parse(event);
    }
  }

  console.log(`Validated canonical event generation for ${decisionFixtures.length} response types`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
