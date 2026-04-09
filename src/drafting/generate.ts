import type { RuntimeRequest } from "../contracts/runtime-request.js";
import type { RuntimeResponse } from "../contracts/runtime-response.js";

type DraftTone = "direct" | "warm" | "urgent";

type MessageDraftVariant = NonNullable<RuntimeResponse["meta"]["message_drafts"]>["variants"][number];
type MessageDraftBundle = NonNullable<RuntimeResponse["meta"]["message_drafts"]>;

const ACTION_COPY: Record<string, { label: string; ask: string; urgencyLine?: string }> = {
  follow_up_1_email: {
    label: "following up on your proposal",
    ask: "Would you like to review it together, or is there anything you want adjusted before moving forward?"
  },
  follow_up_2_email: {
    label: "checking back on your proposal",
    ask: "If the timing has changed, reply with a better window and I can adjust next steps."
  },
  urgency_follow_up: {
    label: "following up before your proposal expires",
    ask: "If you want to keep this moving, reply and I can help lock in the next step.",
    urgencyLine: "I wanted to reach out before the current proposal window closes."
  }
};

export function generateMessageDrafts(params: {
  request: RuntimeRequest;
  response: Pick<RuntimeResponse, "response_type" | "action">;
}): MessageDraftBundle | undefined {
  const { request, response } = params;
  const payload = request.inputs.normalized_payload;

  if (response.response_type !== "success") {
    return undefined;
  }

  if (response.action.action_channel !== "email" || response.action.action_status !== "queued") {
    return undefined;
  }

  const actionType = response.action.action_type;
  if (!actionType) {
    return undefined;
  }

  const copyPlan = ACTION_COPY[actionType];
  if (!copyPlan) {
    return undefined;
  }

  const firstName = firstNameOf(payload.contact_name);
  const ownerName = payload.owner_name.trim();
  const proposalLabel = serviceLabel(payload.service_category);
  const variants: MessageDraftVariant[] = [
    buildVariant({
      variantId: "direct",
      tone: "direct",
      subject: subjectFor(actionType, proposalLabel, false),
      paragraphs: [
        `Hi ${firstName},`,
        `I wanted to follow up on the ${proposalLabel} proposal I sent over.`,
        copyPlan.ask,
        `Thanks,`,
        ownerName
      ]
    }),
    buildVariant({
      variantId: "warm",
      tone: "warm",
      subject: subjectFor(actionType, proposalLabel, true),
      paragraphs: [
        `Hi ${firstName},`,
        `Hope you're doing well. I'm reaching out about the ${proposalLabel} proposal I shared.`,
        copyPlan.ask,
        `If it helps, I can also send a short recap of the scope, pricing, and next steps.`,
        `Thanks,`,
        ownerName
      ]
    }),
    buildVariant({
      variantId: "urgent",
      tone: "urgent",
      subject: urgentSubjectFor(actionType, proposalLabel),
      paragraphs: [
        `Hi ${firstName},`,
        copyPlan.urgencyLine ?? `I wanted to make sure the ${proposalLabel} proposal does not stall if this is still a priority.`,
        copyPlan.ask,
        `A quick reply is enough and I can take it from there.`,
        `Thanks,`,
        ownerName
      ]
    })
  ];

  return {
    source: "deterministic_template",
    action_type: actionType,
    recommended_variant_id: actionType === "urgency_follow_up" ? "urgent" : "warm",
    variants
  };
}

function buildVariant(params: {
  variantId: string;
  tone: DraftTone;
  subject: string;
  paragraphs: string[];
}): MessageDraftVariant {
  return {
    variant_id: params.variantId,
    tone: params.tone,
    subject: params.subject,
    body: params.paragraphs.join("\n\n")
  };
}

function firstNameOf(fullName: string) {
  const [firstName] = fullName.trim().split(/\s+/);
  return firstName || "there";
}

function serviceLabel(serviceCategory: string) {
  const normalized = serviceCategory.trim().toLowerCase();
  return normalized.endsWith("proposal") ? normalized : `${normalized} proposal`;
}

function subjectFor(actionType: string, proposalLabel: string, warm: boolean) {
  if (actionType === "follow_up_1_email") {
    return warm ? `Quick check-in on your ${proposalLabel}` : `Following up on your ${proposalLabel}`;
  }

  if (actionType === "follow_up_2_email") {
    return warm ? `Still interested in the ${proposalLabel}?` : `Checking back on your ${proposalLabel}`;
  }

  return warm ? `Before the ${proposalLabel} expires` : `Your ${proposalLabel} is nearing expiry`;
}

function urgentSubjectFor(actionType: string, proposalLabel: string) {
  if (actionType === "urgency_follow_up") {
    return `Action needed: ${proposalLabel} nearing expiry`;
  }

  return `Last check-in on your ${proposalLabel}`;
}
