import { z } from "zod";
import { VisualAIResponseParseError } from "../errors.js";
import { AskResultSchema, CheckResultSchema, CompareResultSchema } from "../types.js";
import type { AskResult, CheckResult, CompareResult } from "../types.js";

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/s.exec(trimmed);
  return match?.[1] ?? trimmed;
}

const CheckResponseSchema = CheckResultSchema.omit({ usage: true });
const AskResponseSchema = AskResultSchema.omit({ usage: true });
const CompareResponseSchema = CompareResultSchema.omit({ usage: true });

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

export function parseCheckResponse(raw: string): Omit<CheckResult, "usage"> {
  return parseResponse(raw, CheckResponseSchema);
}

export function parseAskResponse(raw: string): Omit<AskResult, "usage"> {
  return parseResponse(raw, AskResponseSchema);
}

export function parseCompareResponse(raw: string): Omit<CompareResult, "usage"> {
  return parseResponse(raw, CompareResponseSchema);
}
