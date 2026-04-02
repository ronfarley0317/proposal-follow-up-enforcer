import crypto from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config.js";
import { sendError } from "../errors.js";

const REQUIRED_HEADERS = [
  "authorization",
  "x-request-id",
  "x-idempotency-key",
  "x-orchestrator",
  "x-orchestrator-workflow-id",
  "x-signature",
  "x-timestamp"
] as const;

export function createAuthMiddleware(config: AppConfig) {
  return async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
    for (const header of REQUIRED_HEADERS) {
      if (!request.headers[header]) {
        request.log.warn({ header }, "Missing required header");
        return sendError(reply, 401, "MISSING_REQUIRED_HEADER", `Missing required header: ${header}`);
      }
    }

    const authorization = request.headers.authorization;
    const timestamp = request.headers["x-timestamp"];
    const signature = request.headers["x-signature"];

    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      request.log.warn("Invalid authorization header");
      return sendError(reply, 401, "AUTH_INVALID", "Authorization header must use Bearer token");
    }

    const token = authorization.slice("Bearer ".length);
    if (!safeEqual(token, config.RUNTIME_BEARER_TOKEN)) {
      request.log.warn("Bearer token rejected");
      return sendError(reply, 401, "AUTH_INVALID", "Bearer token is invalid");
    }

    if (typeof timestamp !== "string") {
      return sendError(reply, 401, "TIMESTAMP_INVALID", "Timestamp header is invalid");
    }

    const requestEpoch = Date.parse(timestamp);
    if (Number.isNaN(requestEpoch)) {
      request.log.warn({ timestamp }, "Timestamp parse failed");
      return sendError(reply, 401, "TIMESTAMP_INVALID", "Timestamp header must be a valid ISO-8601 string");
    }

    const now = Date.now();
    const deltaSeconds = Math.abs(now - requestEpoch) / 1000;
    if (deltaSeconds > config.REQUEST_TIMESTAMP_TOLERANCE_SECONDS) {
      request.log.warn({ deltaSeconds }, "Timestamp outside tolerance");
      return sendError(reply, 401, "TIMESTAMP_EXPIRED", "Request timestamp is outside the allowed tolerance");
    }

    const rawBody = request.rawBody ?? "";
    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", config.RUNTIME_HMAC_SECRET)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex")}`;

    if (typeof signature !== "string" || !safeEqual(signature, expectedSignature)) {
      request.log.warn("Signature verification failed");
      return sendError(reply, 401, "SIGNATURE_INVALID", "Request signature is invalid");
    }
  };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
