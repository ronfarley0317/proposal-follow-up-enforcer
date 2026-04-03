import { z } from "zod";

const orchestratorSchema = z.object({
  name: z.string().min(1),
  workflow_id: z.string().min(1),
  workflow_execution_id: z.string().min(1),
  node_id: z.string().min(1).optional(),
  environment: z.string().min(1)
});

const agentSchema = z.object({
  agent_id: z.string().min(1),
  agent_version: z.string().min(1).optional(),
  policy_version: z.string().min(1).optional()
});

const triggerSchema = z.object({
  trigger_type: z.string().min(1),
  trigger_id: z.string().min(1).optional(),
  trigger_time: z.string().datetime(),
  source_systems: z.array(z.string().min(1)).min(1)
});

const entitySchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  customer_id: z.string().min(1).optional(),
  account_id: z.string().min(1).optional()
});

const normalizedPayloadSchema = z.object({
  proposal_id: z.string().min(1),
  account_id: z.string().min(1),
  contact_id: z.string().min(1),
  contact_name: z.string().min(1),
  contact_email: z.string().email(),
  proposal_value: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/, "currency must be a 3-letter uppercase ISO code"),
  sent_at: z.string().datetime(),
  proposal_status: z.string().min(1),
  owner_id: z.string().min(1),
  owner_name: z.string().min(1),
  owner_email: z.string().email(),
  last_outreach_at: z.string().datetime(),
  follow_up_stage: z.string().min(1),
  proposal_url: z.string().url(),
  pipeline_source: z.string().min(1),
  service_category: z.string().min(1),
  last_response_at: z.string().datetime().optional(),
  proposal_viewed_at: z.string().datetime().optional(),
  view_count: z.number().int().nonnegative().optional(),
  days_to_expiry: z.number().int().optional(),
  do_not_contact: z.boolean().optional(),
  manual_pause_until: z.string().datetime().optional(),
  segment: z.string().min(1).optional(),
  competitor_flag: z.boolean().optional(),
  sms_opt_in: z.boolean().optional(),
  phone_number: z.string().min(1).optional()
}).passthrough();

export const runtimeRequestSchema = z.object({
  api_version: z.string().min(1),
  request_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  sent_at: z.string().datetime(),
  orchestrator: orchestratorSchema,
  agent: agentSchema,
  trigger: triggerSchema,
  entity: entitySchema,
  inputs: z.object({
    normalized_payload: normalizedPayloadSchema
  }),
  options: z.object({
    dry_run: z.boolean().optional(),
    require_dashboard_events: z.boolean().optional(),
    response_detail: z.enum(["minimal", "full"]).optional()
  }).optional()
});

export type RuntimeRequest = z.infer<typeof runtimeRequestSchema>;
export type RuntimeNormalizedPayload = z.infer<typeof normalizedPayloadSchema>;

export function isDryRunRequest(request: RuntimeRequest) {
  return request.options?.dry_run === true;
}
