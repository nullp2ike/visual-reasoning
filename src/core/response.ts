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

/**
 * Control characters other than tab, newline and carriage return. Nothing a
 * model says about a screenshot legitimately contains them, but two routes have
 * been observed emitting them anyway:
 *
 * - Kimi via OpenRouter writes them raw inside string literals, which strict
 *   JSON.parse rejects outright, failing an otherwise good response.
 * - Muse Spark via OpenRouter mangles non-ASCII characters into escaped control
 *   characters: "−" arrives as \u0002 followed by the digits, "é" as \u0000
 *   followed by "e9". Those parse cleanly and then reach the caller as garbage
 *   inside `statements[].statement`, where Zod cannot catch them because any
 *   string validates.
 *
 * The original character cannot be recovered, so it is dropped. That leaves
 * "20%" rather than "−20%", which is wrong but printable, searchable, and safe
 * to log; the control byte was none of those.
 */
// eslint-disable-next-line no-control-regex
const STRAY_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * Parse JSON, retrying once with raw control characters replaced by spaces.
 * The retry is safe: between tokens a control character is whitespace, and
 * inside a string it stands in for text that was already unreadable.
 */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (first) {
    try {
      // eslint-disable-next-line no-control-regex
      return JSON.parse(text.replace(/[\u0000-\u001f]/g, " ")) as unknown;
    } catch {
      throw first;
    }
  }
}

/** Drop stray control characters from every string in a parsed JSON value. */
export function stripControlCharacters<T>(value: T): T {
  if (typeof value === "string") return value.replace(STRAY_CONTROL_CHARS, "") as T;
  if (Array.isArray(value)) return value.map((item: unknown) => stripControlCharacters(item)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = stripControlCharacters(item);
    }
    return out as T;
  }
  return value;
}

function parseResponse<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = stripControlCharacters(parseJson(stripCodeFences(raw)));
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
  const result = parseResponse(raw, AskResponseSchema);
  return {
    ...result,
    frameReferences: result.frameReferences ?? undefined,
  };
}

export function parseCompareResponse(raw: string): Omit<CompareResult, "usage"> {
  return parseResponse(raw, CompareResponseSchema);
}
