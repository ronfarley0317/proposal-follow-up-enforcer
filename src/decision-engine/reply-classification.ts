import type { RuntimeNormalizedPayload } from "../contracts/runtime-request.js";

export type ReplyClassification = "interested" | "objection" | "delay" | "lost" | "closed";

export type ReplyClassificationResult = {
  classification: ReplyClassification;
  confidence: number;
  source: "payload" | "deterministic_rules";
};

const RULES: Array<{
  classification: ReplyClassification;
  confidence: number;
  patterns: RegExp[];
}> = [
  {
    classification: "closed",
    confidence: 0.98,
    patterns: [
      /\bsigned\b/i,
      /\bmove forward\b/i,
      /\blet'?s do this\b/i,
      /\bapproved\b/i,
      /\bready to proceed\b/i
    ]
  },
  {
    classification: "lost",
    confidence: 0.97,
    patterns: [
      /\bnot interested\b/i,
      /\bwent with (someone|another|a different)\b/i,
      /\bchose another\b/i,
      /\bno thanks\b/i,
      /\bwe're all set\b/i
    ]
  },
  {
    classification: "objection",
    confidence: 0.9,
    patterns: [
      /\btoo expensive\b/i,
      /\bbudget\b/i,
      /\bconcern\b/i,
      /\bquestion\b/i,
      /\bnot sure\b/i,
      /\bprice\b/i
    ]
  },
  {
    classification: "delay",
    confidence: 0.9,
    patterns: [
      /\bnext (week|month|quarter)\b/i,
      /\bafter\b/i,
      /\bnot right now\b/i,
      /\bcircle back\b/i,
      /\bfollow up later\b/i,
      /\breach out in\b/i
    ]
  },
  {
    classification: "interested",
    confidence: 0.88,
    patterns: [
      /\binterested\b/i,
      /\blooks good\b/i,
      /\bcall me\b/i,
      /\bcan we talk\b/i,
      /\bwhat are the next steps\b/i,
      /\bwhen can we start\b/i
    ]
  }
];

export function classifyReply(payload: RuntimeNormalizedPayload): ReplyClassificationResult | null {
  if (payload.reply_classification) {
    return {
      classification: payload.reply_classification,
      confidence: payload.reply_classification_confidence ?? 0.99,
      source: "payload"
    };
  }

  if (!payload.last_reply_text) {
    return null;
  }

  const text = payload.last_reply_text.trim();
  if (!text) {
    return null;
  }

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return {
        classification: rule.classification,
        confidence: rule.confidence,
        source: "deterministic_rules"
      };
    }
  }

  return null;
}
