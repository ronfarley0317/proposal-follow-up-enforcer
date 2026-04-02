import type { FastifyReply } from "fastify";
import type { ZodIssue } from "zod";

type ErrorDetails = {
  path: string;
  message: string;
  code: string;
}[];

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  errorCode: string,
  errorMessage: string,
  details?: unknown
) {
  return reply.code(statusCode).send({
    error_code: errorCode,
    error_message: errorMessage,
    retryable: statusCode >= 500 || statusCode === 429,
    details
  });
}

export function formatZodIssues(issues: ZodIssue[]) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code
  })) satisfies ErrorDetails;
}

export function classifyValidationIssues(issues: ZodIssue[]) {
  const formatted = formatZodIssues(issues);
  const missingFields = formatted.filter(
    (issue) => issue.code === "invalid_type" && issue.message.toLowerCase().includes("required")
  );

  if (missingFields.length > 0) {
    return {
      statusCode: 422,
      errorCode: "MISSING_REQUIRED_FIELDS",
      errorMessage: "Request is missing one or more required fields",
      details: missingFields
    };
  }

  return {
    statusCode: 422,
    errorCode: "SCHEMA_VALIDATION_FAILED",
    errorMessage: "Request body failed runtime handoff validation",
    details: formatted
  };
}
