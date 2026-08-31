import type { ZodError } from "zod";

export type ApiValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export function apiValidationError(error: ZodError) {
  const issues: ApiValidationIssue[] = error.issues.map((issue) => ({
    path: issue.path.length ? issue.path.map(String).join(".") : "request",
    code: issue.code,
    message: issue.message
  }));
  const first = issues[0];
  const message = first
    ? `Invalid request: ${first.path} — ${first.message}`
    : "Invalid request data";

  return {
    error: "validation_error" as const,
    code: "validation_error" as const,
    message,
    details: {
      ...error.flatten(),
      issues
    }
  };
}
