import { z } from "zod";

export const enforcementEventSchema = z.object({
  schema_version: z.string().regex(/^1\.\d+\.\d+$/),
  event_id: z.string().min(1),
  event_time: z.string().datetime(),
  event_type: z.enum([
    "agent.evaluated",
    "agent.action_queued",
    "agent.action_sent",
    "agent.action_executed",
    "agent.action_suppressed",
    "agent.escalated",
    "agent.human_review_requested",
    "agent.human_review_resolved",
    "agent.resolved",
    "agent.failed"
  ]),
  agent: z.object({
    agent_id: z.string().min(1),
    agent_name: z.string().min(1),
    agent_version: z.string().min(1),
    library_version: z.string().nullable().optional(),
    owner: z.string().nullable().optional()
  }),
  execution: z.object({
    execution_id: z.string().min(1),
    workflow_id: z.string().nullable().optional(),
    trigger_type: z.string().min(1),
    trigger_id: z.string().nullable().optional(),
    source_systems: z.array(z.string().min(1)).min(1),
    idempotency_key: z.string().nullable().optional(),
    latency_ms: z.number().int().min(0).nullable().optional()
  }),
  entity: z.object({
    entity_type: z.enum([
      "account",
      "customer",
      "invoice",
      "opportunity",
      "proposal",
      "estimate",
      "subscription",
      "contract",
      "renewal",
      "ticket",
      "payment",
      "job",
      "other"
    ]),
    entity_id: z.string().min(1),
    parent_entity_type: z.string().nullable().optional(),
    parent_entity_id: z.string().nullable().optional(),
    customer_id: z.string().nullable().optional(),
    account_id: z.string().nullable().optional(),
    external_refs: z
      .array(
        z.object({
          system: z.string().min(1),
          id: z.string().min(1)
        })
      )
      .default([])
  }),
  decision: z.object({
    decision_code: z.string().min(1),
    decision_label: z.string().min(1),
    decision_confidence: z.number().min(0).max(1),
    reason_codes: z.array(z.string().min(1)).min(1),
    policy_version: z.string().nullable().optional(),
    leakage_condition: z.string().nullable().optional()
  }),
  action: z.object({
    action_type: z.string().nullable().optional(),
    action_status: z.enum([
      "none",
      "proposed",
      "queued",
      "sent",
      "executed",
      "suppressed",
      "escalated",
      "awaiting_human",
      "failed",
      "resolved"
    ]),
    action_channel: z.string().nullable().optional(),
    action_target: z.string().nullable().optional(),
    scheduled_for: z.string().datetime().nullable().optional(),
    completed_at: z.string().datetime().nullable().optional()
  }),
  revenue: z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    revenue_at_risk: z.number().min(0),
    revenue_protected: z.number().min(0),
    revenue_recovered: z.number().min(0),
    expected_value: z.number().min(0),
    attribution_window_days: z.number().int().min(0).nullable().optional(),
    revenue_formula_ref: z.string().nullable().optional()
  }),
  escalation: z.object({
    escalation_flag: z.boolean(),
    escalation_level: z.string().nullable().optional(),
    escalation_target: z.string().nullable().optional(),
    escalation_reason: z.string().nullable().optional(),
    escalation_due_at: z.string().datetime().nullable().optional()
  }),
  human_review: z.object({
    human_review_required: z.boolean(),
    human_review_status: z.enum([
      "not_required",
      "pending",
      "approved",
      "rejected",
      "overridden",
      "timed_out"
    ]),
    reviewer_id: z.string().nullable().optional(),
    review_notes: z.string().nullable().optional(),
    reviewed_at: z.string().datetime().nullable().optional()
  }),
  status: z.object({
    outcome: z.enum(["success", "suppressed", "escalated", "pending_human", "failed", "resolved"]),
    terminal: z.boolean(),
    error_code: z.string().nullable().optional(),
    error_message: z.string().nullable().optional()
  }),
  metadata: z.record(z.string(), z.unknown())
});

export type EnforcementEvent = z.infer<typeof enforcementEventSchema>;
