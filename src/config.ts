import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SERVICE_NAME: z.string().min(1).default("proposal-follow-up-enforcer-runtime"),
  SERVICE_ENVIRONMENT: z.string().min(1).default("development"),
  AGENT_ID: z.literal("proposal-follow-up-enforcer"),
  AGENT_VERSION: z.string().min(1),
  API_VERSION: z.string().min(1).default("1.0"),
  TIMEZONE_DEFAULT: z.string().min(1).default("America/New_York"),
  RUNTIME_BEARER_TOKEN: z.string().min(16),
  RUNTIME_HMAC_SECRET: z.string().min(16),
  REQUEST_TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  REQUEST_MAX_BODY_BYTES: z.coerce.number().int().min(1024).max(1048576).default(262144),
  DB_CLIENT: z.literal("sqlite").default("sqlite"),
  SQLITE_DB_PATH: z.string().min(1).default("./data/proposal-follow-up-enforcer.db"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  READINESS_TIMEOUT_MS: z.coerce.number().int().min(250).max(10000).default(2000),
  KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  FORCE_DEFAULT_SECRETS_ALLOWED: z
    .union([z.boolean(), z.string()])
    .transform((value) => {
      if (typeof value === "boolean") return value;
      return value === "true";
    })
    .default(false),
  AI_DRAFTING_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((value) => {
      if (typeof value === "boolean") return value;
      return value === "true";
    })
    .default(false),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  FOLLOW_UP_1_DELAY_HOURS: z.coerce.number().int().min(1).default(24),
  FOLLOW_UP_2_DELAY_HOURS: z.coerce.number().int().min(1).default(72),
  CALL_TASK_DELAY_DAYS: z.coerce.number().int().min(1).default(7),
  MAX_AUTOMATED_EMAIL_TOUCHES: z.coerce.number().int().min(1).default(2),
  RECENT_REPLY_SUPPRESSION_HOURS: z.coerce.number().int().min(1).default(72),
  RECENT_OUTREACH_SUPPRESSION_HOURS: z.coerce.number().int().min(1).default(24),
  ESCALATION_VALUE_THRESHOLD: z.coerce.number().nonnegative().default(5000),
  ESCALATION_SILENCE_HOURS: z.coerce.number().int().min(1).default(72),
  HIGH_VALUE_APPROVAL_THRESHOLD: z.coerce.number().nonnegative().default(15000),
  EXPIRY_URGENCY_DAYS: z.coerce.number().int().min(1).default(2),
  LOW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  VIEW_INTENT_PRIORITY_WINDOW_HOURS: z.coerce.number().int().min(1).default(24),
  SENSITIVE_SEGMENTS: z
    .string()
    .default("vip,strategic,sensitive")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    ),
  TRUST_PROXY: z
    .union([z.boolean(), z.string()])
    .transform((value) => {
      if (typeof value === "boolean") return value;
      return value === "true";
    })
    .default(false)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(env);

  if (parsed.NODE_ENV === "production") {
    if (
      !parsed.FORCE_DEFAULT_SECRETS_ALLOWED &&
      (parsed.RUNTIME_BEARER_TOKEN === "replace-with-strong-shared-token" ||
        parsed.RUNTIME_HMAC_SECRET === "replace-with-strong-hmac-secret")
    ) {
      throw new Error("Production configuration cannot use placeholder runtime secrets.");
    }

    if (parsed.LOG_LEVEL === "trace") {
      throw new Error("Production configuration cannot use LOG_LEVEL=trace.");
    }
  }

  return parsed;
}
