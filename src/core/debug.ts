import { calculateCost } from "./pricing.js";
import type { ResolvedConfig } from "./config.js";
import type { ProviderDriver, RawProviderResponse } from "../providers/types.js";
import type { NormalizedImage, UsageInfo } from "../types.js";

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
