import type { AppConfig } from "../config.js";
import type { DecisionEnginePolicy } from "./types.js";

export function buildDecisionPolicy(config: AppConfig): DecisionEnginePolicy {
  return {
    followUp1DelayHours: config.FOLLOW_UP_1_DELAY_HOURS,
    followUp2DelayHours: config.FOLLOW_UP_2_DELAY_HOURS,
    callTaskDelayDays: config.CALL_TASK_DELAY_DAYS,
    maxAutomatedEmailTouches: config.MAX_AUTOMATED_EMAIL_TOUCHES,
    recentReplySuppressionHours: config.RECENT_REPLY_SUPPRESSION_HOURS,
    recentOutreachSuppressionHours: config.RECENT_OUTREACH_SUPPRESSION_HOURS,
    escalationValueThreshold: config.ESCALATION_VALUE_THRESHOLD,
    escalationSilenceHours: config.ESCALATION_SILENCE_HOURS,
    highValueApprovalThreshold: config.HIGH_VALUE_APPROVAL_THRESHOLD,
    expiryUrgencyDays: config.EXPIRY_URGENCY_DAYS,
    lowConfidenceThreshold: config.LOW_CONFIDENCE_THRESHOLD,
    viewIntentPriorityWindowHours: config.VIEW_INTENT_PRIORITY_WINDOW_HOURS,
    riskScoreHighThreshold: config.RISK_SCORE_HIGH_THRESHOLD,
    riskScoreMediumThreshold: config.RISK_SCORE_MEDIUM_THRESHOLD,
    highRiskServiceCategories: config.HIGH_RISK_SERVICE_CATEGORIES,
    sensitiveSegments: config.SENSITIVE_SEGMENTS
  };
}
