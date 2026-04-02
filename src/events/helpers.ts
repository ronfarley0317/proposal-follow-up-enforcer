import type { RuntimeNormalizedPayload } from "../contracts/runtime-request.js";

export function getProposalValueBand(proposalValue: number) {
  if (proposalValue < 2500) return "0_2500";
  if (proposalValue < 5000) return "2500_5000";
  if (proposalValue < 10000) return "5000_10000";
  if (proposalValue < 25000) return "10000_25000";
  return "25000_plus";
}

export function getDaysSinceSent(payload: RuntimeNormalizedPayload, eventTime: Date) {
  const sentAt = Date.parse(payload.sent_at);
  return Number(((eventTime.getTime() - sentAt) / (1000 * 60 * 60 * 24)).toFixed(2));
}
