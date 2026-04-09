import { z } from "zod";
import { enforcementEventSchema } from "./enforcement-event.js";

export const responseTypeSchema = z.enum([
  "success",
  "suppressed",
  "escalated",
  "pending_human",
  "failed"
]);

export const responseErrorSchema = z.object({
  error_code: z.string().min(1),
  error_message: z.string().min(1),
  retryable: z.boolean(),
  field: z.string().min(1).optional()
});

export const decisionSchema = z.object({
  decision_code: z.string().min(1),
  decision_label: z.string().min(1),
  decision_confidence: z.number().min(0).max(1),
  reason_codes: z.array(z.string().min(1)).min(1),
  leakage_condition: z.string().nullable()
});

export const actionSchema = z.object({
  action_type: z.string().nullable(),
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
  action_channel: z.string().nullable(),
  action_target: z.string().nullable()
});

export const routingSchema = z.object({
  route: z.enum(["action", "suppress", "escalation", "human_review", "failure"]),
  priority: z.enum(["low", "normal", "high"]),
  human_review_required: z.boolean(),
  escalation_required: z.boolean()
});

export const runtimeResponseSchema = z.object({
  api_version: z.string().min(1),
  request_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  agent_id: z.string().min(1),
  agent_version: z.string().min(1),
  execution_id: z.string().min(1),
  response_type: responseTypeSchema,
  decision: decisionSchema,
  action: actionSchema,
  routing: routingSchema,
  dashboard_events: z.array(enforcementEventSchema).min(1),
  errors: z.array(responseErrorSchema),
  meta: z.object({
    terminal: z.boolean(),
    dry_run: z.boolean().optional(),
    risk_score: z.object({
      score: z.number().int().min(0).max(100),
      level: z.enum(["low", "medium", "high"]),
      factors: z.array(z.string().min(1)).min(1)
    }).optional(),
    escalation_summary: z.object({
      headline: z.string().min(1),
      owner_brief: z.string().min(1),
      key_facts: z.array(z.string().min(1)).min(1),
      recommended_next_step: z.string().min(1)
    }).optional(),
    message_drafts: z.object({
      source: z.enum(["deterministic_template"]),
      action_type: z.string().min(1),
      recommended_variant_id: z.string().min(1),
      variants: z.array(z.object({
        variant_id: z.string().min(1),
        tone: z.enum(["direct", "warm", "urgent"]),
        subject: z.string().min(1),
        body: z.string().min(1)
      })).min(1)
    }).optional()
  })
});

export type RuntimeResponse = z.infer<typeof runtimeResponseSchema>;
export type RuntimeResponseType = z.infer<typeof responseTypeSchema>;
