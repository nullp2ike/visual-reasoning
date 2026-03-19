import { z } from "zod";
import { VisualAIResponseParseError } from "../errors.js";
import { AskResultSchema, CheckResultSchema, CompareResultSchema } from "../types.js";
import type { AskResult, CheckResult, CompareResult } from "../types.js";

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/s.exec(trimmed);
  return match?.[1] ?? trimmed;
}

export const CheckResponseSchema = CheckResultSchema.omit({ usage: true });
export const AskResponseSchema = AskResultSchema.omit({ usage: true });
export const CompareResponseSchema = CompareResultSchema.omit({ usage: true });

function parseResponse<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new VisualAIResponseParseError(
      `Failed to parse AI response as JSON: ${raw.slice(0, 200)}`,
      raw,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new VisualAIResponseParseError(
      `AI response does not match expected schema: ${result.error.message}`,
      raw,
    );
  }

  return result.data;
}

function reconcileCheckResult(result: Omit<CheckResult, "usage">): Omit<CheckResult, "usage"> {
  if (result.statements.length === 0) {
    return result;
  }

  const passCount = result.statements.filter((s) => s.pass).length;
  const total = result.statements.length;
  const computedPass = passCount === total;
  const countPrefix = `${passCount} of ${total} checks passed`;
  const reasoning = `${countPrefix}. ${result.reasoning}`;

  return {
    ...result,
    pass: computedPass,
    reasoning,
  };
}

export function parseCheckResponse(raw: string): Omit<CheckResult, "usage"> {
  const result = parseResponse(raw, CheckResponseSchema);
  return reconcileCheckResult(result);
}

export function parseAskResponse(raw: string): Omit<AskResult, "usage"> {
  return parseResponse(raw, AskResponseSchema);
}

export function parseCompareResponse(raw: string): Omit<CompareResult, "usage"> {
  return parseResponse(raw, CompareResponseSchema);
}
