import { calculateCost } from "./pricing.js";
import type { ResolvedConfig } from "./config.js";
import type { ProviderDriver, RawProviderResponse } from "../providers/types.js";
import type { NormalizedImage, UsageInfo } from "../types.js";
import { VisualAIError, VisualAIResponseParseError } from "../errors.js";

export type DebugLogKind = "prompt" | "response" | "error";

export function debugLog(
  config: ResolvedConfig,
  label: string,
  data: string,
  kind: DebugLogKind = "error",
): void {
  const enabled =
    kind === "prompt"
      ? config.debugPrompt
      : kind === "response"
        ? config.debugResponse
        : config.debug;

  if (enabled) {
    process.stderr.write(`[visual-ai-assertions] ${label}: ${data}\n`);
  }
}

export function usageLog(config: ResolvedConfig, method: string, usage: UsageInfo): void {
  if (!config.trackUsage) return;
  const costStr =
    usage.estimatedCost !== undefined ? `$${usage.estimatedCost.toFixed(6)}` : "unknown";
  process.stderr.write(
    `[visual-ai-assertions] ${method} usage: ${usage.inputTokens} input + ${usage.outputTokens} output tokens (${costStr}) in ${usage.durationSeconds?.toFixed(3) ?? "0.000"}s [${config.model}]\n`,
  );
}

export function processUsage(
  method: string,
  rawUsage: RawProviderResponse["usage"],
  durationSeconds: number,
  config: ResolvedConfig,
): UsageInfo {
  const inputTokens = rawUsage?.inputTokens ?? 0;
  const outputTokens = rawUsage?.outputTokens ?? 0;
  const usage: UsageInfo = {
    inputTokens,
    outputTokens,
    estimatedCost: calculateCost(config.provider, config.model, inputTokens, outputTokens),
    durationSeconds,
  };
  usageLog(config, method, usage);
  return usage;
}

const MAX_RAW_RESPONSE_PREVIEW = 500;

export function formatError(error: unknown): string {
  if (error instanceof VisualAIResponseParseError) {
    const truncated =
      error.rawResponse.length > MAX_RAW_RESPONSE_PREVIEW
        ? error.rawResponse.slice(0, MAX_RAW_RESPONSE_PREVIEW) + "..."
        : error.rawResponse;
    return `${error.name} (${error.code}): ${error.message}. Raw (truncated): ${truncated}`;
  }
  if (error instanceof VisualAIError) {
    return `${error.name} (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

export async function withErrorDebug<T>(
  config: ResolvedConfig,
  method: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    debugLog(config, `${method} error`, formatError(error), "error");
    throw error;
  }
}

export async function timedSendMessage(
  driver: ProviderDriver,
  images: NormalizedImage[],
  prompt: string,
): Promise<RawProviderResponse & { durationSeconds: number }> {
  const start = performance.now();
  const response = await driver.sendMessage(images, prompt);
  const durationSeconds = (performance.now() - start) / 1000;
  return { ...response, durationSeconds };
}
