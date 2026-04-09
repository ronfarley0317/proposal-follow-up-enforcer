import type { RuntimeResponse } from "../contracts/runtime-response.js";
import type { DecisionEnginePolicy, DerivedTiming, DecisionContext } from "./types.js";

type RiskScore = NonNullable<RuntimeResponse["meta"]["risk_score"]>;

export function generateRiskScore(params: {
  policy: DecisionEnginePolicy;
  derived: DerivedTiming;
  context: Pick<DecisionContext, "payload">;
}): RiskScore {
  const { policy, derived, context } = params;
  const { payload } = context;

  let score = 0;
  const factors: string[] = [];

  if (derived.silenceHours >= policy.escalationSilenceHours) {
    score += 35;
    factors.push("Escalation-grade silence detected");
  } else if (derived.silenceHours >= policy.followUp2DelayHours) {
    score += 20;
    factors.push("Extended silence window exceeded");
  } else if (derived.silenceHours >= policy.followUp1DelayHours) {
    score += 10;
    factors.push("Initial silence window exceeded");
  }

  if (derived.hoursSinceSent >= policy.callTaskDelayDays * 24) {
    score += 20;
    factors.push("Proposal age exceeds call threshold");
  }

  if (payload.proposal_value >= policy.highValueApprovalThreshold) {
    score += 50;
    factors.push("Proposal exceeds approval threshold");
  } else if (payload.proposal_value >= policy.escalationValueThreshold) {
    score += 25;
    factors.push("Proposal exceeds escalation threshold");
  }

  if (derived.recentViewIntent) {
    score += 10;
    factors.push("Recent proposal view intent detected");
  }

  if ((payload.view_count ?? 0) >= 3) {
    score += 10;
    factors.push("Proposal viewed multiple times");
  }

  if (derived.touchCount >= 1) {
    score += 10;
    factors.push("Follow-up sequence already underway");
  }

  if (derived.daysToExpiry !== null && derived.daysToExpiry <= policy.expiryUrgencyDays) {
    score += 15;
    factors.push("Proposal near expiry");
  }

  if (policy.highRiskServiceCategories.includes(payload.service_category.trim().toLowerCase())) {
    score += 10;
    factors.push("High-risk service category");
  }

  if (derived.replyClassification?.classification === "objection") {
    score += 20;
    factors.push("Reply contains objection");
  }

  if (derived.replyClassification?.classification === "interested") {
    score += 20;
    factors.push("Prospect reply indicates active interest");
  }

  if (derived.replyClassification?.classification === "lost" || derived.replyClassification?.classification === "closed") {
    score -= 20;
    factors.push("Reply reduces follow-up risk");
  }

  score = Math.max(0, Math.min(100, score));

  const level =
    score >= policy.riskScoreHighThreshold
      ? "high"
      : score >= policy.riskScoreMediumThreshold
        ? "medium"
        : "low";

  return {
    score,
    level,
    factors: factors.length > 0 ? factors : ["Baseline deterministic risk only"]
  };
}
