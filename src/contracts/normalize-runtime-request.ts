import { z } from "zod";

import {
  runtimeIncomingRequestSchema,
  runtimeRequestSchema,
  type RuntimeIncomingRequest,
  type RuntimeNormalizationHints,
  type RuntimeRequest
} from "./runtime-request.js";

const DEFAULT_FIELD_ALIASES: Record<string, string[]> = {
  proposal_id: ["proposal_id", "proposalId", "estimate_id", "estimateId", "quote_id", "quoteId", "deal_id", "dealId"],
  account_id: ["account_id", "accountId", "company_id", "companyId", "organization_id", "organizationId"],
  contact_id: ["contact_id", "contactId", "person_id", "personId", "lead_id", "leadId"],
  contact_name: ["contact_name", "contactName", "customer_name", "customerName", "prospect_name", "prospectName"],
  contact_email: ["contact_email", "contactEmail", "email", "customer_email", "customerEmail", "prospect_email", "prospectEmail"],
  proposal_value: ["proposal_value", "proposalValue", "amount", "deal_value", "dealValue", "quote_total", "quoteTotal"],
  currency: ["currency", "currency_code", "currencyCode"],
  sent_at: ["sent_at", "sentAt", "proposal_sent_at", "proposalSentAt", "created_at", "createdAt"],
  proposal_status: ["proposal_status", "proposalStatus", "status", "deal_stage", "dealStage"],
  owner_id: ["owner_id", "ownerId", "rep_id", "repId", "sales_rep_id", "salesRepId"],
  owner_name: ["owner_name", "ownerName", "rep_name", "repName", "sales_rep_name", "salesRepName"],
  owner_email: ["owner_email", "ownerEmail", "rep_email", "repEmail", "sales_rep_email", "salesRepEmail"],
  last_outreach_at: ["last_outreach_at", "lastOutreachAt", "last_contacted_at", "lastContactedAt", "last_touch_at", "lastTouchAt"],
  follow_up_stage: ["follow_up_stage", "followUpStage", "touch_stage", "touchStage", "sequence_stage", "sequenceStage"],
  proposal_url: ["proposal_url", "proposalUrl", "estimate_url", "estimateUrl", "quote_url", "quoteUrl"],
  pipeline_source: ["pipeline_source", "pipelineSource", "lead_source", "leadSource", "source"],
  service_category: ["service_category", "serviceCategory", "category", "service_type", "serviceType"],
  last_response_at: ["last_response_at", "lastResponseAt", "replied_at", "repliedAt"],
  proposal_viewed_at: ["proposal_viewed_at", "proposalViewedAt", "last_viewed_at", "lastViewedAt"],
  view_count: ["view_count", "viewCount", "views", "open_count", "openCount"],
  days_to_expiry: ["days_to_expiry", "daysToExpiry", "expiry_days_remaining", "expiryDaysRemaining"],
  do_not_contact: ["do_not_contact", "doNotContact", "dnc"],
  manual_pause_until: ["manual_pause_until", "manualPauseUntil", "pause_until", "pauseUntil"],
  segment: ["segment", "customer_segment", "customerSegment"],
  competitor_flag: ["competitor_flag", "competitorFlag", "competitor_present", "competitorPresent"],
  sms_opt_in: ["sms_opt_in", "smsOptIn", "text_opt_in", "textOptIn"],
  phone_number: ["phone_number", "phoneNumber", "mobile", "mobile_number", "mobileNumber"]
  ,
  last_reply_text: ["last_reply_text", "lastReplyText", "reply_text", "replyText", "latest_reply_text", "latestReplyText"],
  last_reply_channel: ["last_reply_channel", "lastReplyChannel", "reply_channel", "replyChannel"],
  reply_classification: ["reply_classification", "replyClassification", "reply_intent", "replyIntent"],
  reply_classification_confidence: [
    "reply_classification_confidence",
    "replyClassificationConfidence",
    "reply_intent_confidence",
    "replyIntentConfidence"
  ]
};

type NormalizeRuntimeRequestResult =
  | { success: true; data: RuntimeRequest }
  | { success: false; error: z.ZodError };

export function normalizeRuntimeRequest(input: unknown): NormalizeRuntimeRequestResult {
  const incomingParsed = runtimeIncomingRequestSchema.safeParse(input);
  if (!incomingParsed.success) {
    return incomingParsed;
  }

  const incoming = incomingParsed.data;
  const normalizedPayload = buildNormalizedPayload(incoming);

  const canonicalCandidate = {
    ...incoming,
    inputs: {
      normalized_payload: normalizedPayload
    }
  };

  const canonicalParsed = runtimeRequestSchema.safeParse(canonicalCandidate);
  if (!canonicalParsed.success) {
    return canonicalParsed;
  }

  return canonicalParsed;
}

function buildNormalizedPayload(incoming: RuntimeIncomingRequest) {
  const partialNormalized = incoming.inputs.normalized_payload ?? {};
  const rawPayload = incoming.inputs.raw_payload ?? {};
  const hints = incoming.inputs.normalization_hints;

  const normalizedFromRaw = Object.fromEntries(
    Object.keys(DEFAULT_FIELD_ALIASES).map((field) => [
      field,
      normalizeFieldValue(field, findRawValue(field, rawPayload, hints))
    ])
  );

  return Object.fromEntries(
    Object.entries({
      ...normalizedFromRaw,
      ...partialNormalized
    }).filter(([, value]) => value !== undefined)
  );
}

function findRawValue(field: string, rawPayload: Record<string, unknown>, hints?: RuntimeNormalizationHints) {
  const hintAliases = hints?.field_aliases?.[field] ?? [];
  const aliases = [...hintAliases, ...(DEFAULT_FIELD_ALIASES[field] ?? [])];

  for (const alias of aliases) {
    const value = getByPath(rawPayload, alias);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function getByPath(value: Record<string, unknown>, path: string) {
  if (path in value) {
    return value[path];
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, value);
}

function normalizeFieldValue(field: string, value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  switch (field) {
    case "proposal_value":
      return normalizeNumber(value);
    case "view_count":
    case "days_to_expiry":
      return normalizeInteger(value);
    case "do_not_contact":
    case "competitor_flag":
    case "sms_opt_in":
      return normalizeBoolean(value);
    case "reply_classification":
      return normalizeReplyClassification(value);
    case "currency":
      return normalizeString(value)?.toUpperCase();
    case "sent_at":
    case "last_outreach_at":
    case "last_response_at":
    case "proposal_viewed_at":
    case "manual_pause_until":
      return normalizeDateTime(value);
    case "reply_classification_confidence":
      return normalizeBoundedNumber(value);
    default:
      return normalizeString(value);
  }
}

function normalizeString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeInteger(value: unknown) {
  const normalized = normalizeNumber(value);
  if (normalized === undefined) {
    return undefined;
  }

  return Math.trunc(normalized);
}

function normalizeBoundedNumber(value: unknown) {
  const normalized = normalizeNumber(value);
  if (normalized === undefined || normalized < 0 || normalized > 1) {
    return undefined;
  }

  return normalized;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "no", "n", "0"].includes(normalized)) return false;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return undefined;
}

function normalizeDateTime(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeReplyClassification(value: unknown) {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (["interested", "objection", "delay", "lost", "closed"].includes(normalized)) {
    return normalized;
  }

  return undefined;
}
