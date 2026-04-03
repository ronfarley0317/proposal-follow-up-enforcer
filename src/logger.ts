import pino from "pino";

import type { AppConfig } from "./config.js";

export function createLogger(config: AppConfig) {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.x-signature",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.x-signature",
        "request.headers.cookie",
        "request.body",
        "body",
        "*.contact_email",
        "*.owner_email",
        "*.action_target"
      ],
      remove: true
    },
    base: {
      service: config.SERVICE_NAME,
      environment: config.SERVICE_ENVIRONMENT,
      agent_id: config.AGENT_ID,
      agent_version: config.AGENT_VERSION
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      log(object) {
        return maskLogObject(object);
      }
    }
  });
}

function maskLogObject(value: Record<string, unknown>) {
  const clone = structuredCloneSafe(value);

  maskField(clone, "contact_email");
  maskField(clone, "owner_email");
  maskField(clone, "action_target");

  return clone;
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function maskField(object: Record<string, unknown>, fieldName: string) {
  if (fieldName in object && typeof object[fieldName] === "string") {
    object[fieldName] = maskString(object[fieldName] as string);
  }
}

function maskString(value: string) {
  if (value.includes("@")) {
    const [local = "", domain = ""] = value.split("@");
    const visible = local.slice(0, 2);
    return `${visible}***@${domain}`;
  }

  if (value.length <= 4) {
    return "***";
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
