import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODELS,
  MODEL_TO_PROVIDER,
  OPENAI_REASONING_MAX_TOKENS,
} from "../constants.js";
import { VisualAIConfigError } from "../errors.js";
import type { ProviderName, VisualAIConfig } from "../types.js";

export interface ResolvedConfig {
  provider: ProviderName;
  apiKey: string | undefined;
  model: string;
  maxTokens: number;
  reasoningEffort: VisualAIConfig["reasoningEffort"];
  debug: boolean;
  debugPrompt: boolean;
  debugResponse: boolean;
  trackUsage: boolean;
}

const MODEL_PREFIX_TO_PROVIDER: [string, ProviderName][] = [
  ["claude-", "anthropic"],
  ["gpt-", "openai"],
  ["o1-", "openai"],
  ["o3-", "openai"],
  ["o4-", "openai"],
  ["gemini-", "google"],
];

function inferProviderFromModel(model: string): ProviderName | undefined {
  const known = MODEL_TO_PROVIDER.get(model);
  if (known) return known;

  const prefixMatch = MODEL_PREFIX_TO_PROVIDER.find(([prefix]) => model.startsWith(prefix));
  return prefixMatch?.[1];
}

function resolveProvider(config: VisualAIConfig): ProviderName {
  const model = config.model ?? process.env.VISUAL_AI_MODEL;
  if (model) {
    const inferred = inferProviderFromModel(model);
    if (inferred) return inferred;
  }

  const apiKeyProviderMap: [string, ProviderName][] = [
    ["ANTHROPIC_API_KEY", "anthropic"],
    ["OPENAI_API_KEY", "openai"],
    ["GOOGLE_API_KEY", "google"],
  ];
  const detected = apiKeyProviderMap.find(([key]) => process.env[key]);
  if (detected) return detected[1];

  throw new VisualAIConfigError(
    "Cannot determine provider. Set a model name (config or VISUAL_AI_MODEL) or an API key env variable (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY).",
  );
}

function parseBooleanEnv(envName: string, value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  throw new VisualAIConfigError(
    `Invalid ${envName} value: "${value}". Use "true", "1", "false", or "0".`,
  );
}

let debugDeprecationWarned = false;

/** @internal Reset the deprecation warning guard. For testing only. */
export function resetDebugDeprecationWarning(): void {
  debugDeprecationWarned = false;
}

export function resolveConfig(config: VisualAIConfig): ResolvedConfig {
  const provider = resolveProvider(config);
  const model = config.model ?? process.env.VISUAL_AI_MODEL ?? DEFAULT_MODELS[provider];
  const debug =
    config.debug ?? parseBooleanEnv("VISUAL_AI_DEBUG", process.env.VISUAL_AI_DEBUG) ?? false;
  const debugPrompt =
    config.debugPrompt ??
    parseBooleanEnv("VISUAL_AI_DEBUG_PROMPT", process.env.VISUAL_AI_DEBUG_PROMPT) ??
    false;
  const debugResponse =
    config.debugResponse ??
    parseBooleanEnv("VISUAL_AI_DEBUG_RESPONSE", process.env.VISUAL_AI_DEBUG_RESPONSE) ??
    false;

  if (debug && !debugPrompt && !debugResponse && !debugDeprecationWarned) {
    debugDeprecationWarned = true;
    process.stderr.write(
      `[visual-ai-assertions] Warning: VISUAL_AI_DEBUG no longer enables prompt/response logging. Use VISUAL_AI_DEBUG_PROMPT=true and/or VISUAL_AI_DEBUG_RESPONSE=true instead.\n`,
    );
  }

  const userSetMaxTokens = config.maxTokens !== undefined;
  let maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;

  // OpenAI reasoning tokens share the output budget, so auto-increase for high/xhigh
  if (
    !userSetMaxTokens &&
    provider === "openai" &&
    (config.reasoningEffort === "high" || config.reasoningEffort === "xhigh")
  ) {
    maxTokens = OPENAI_REASONING_MAX_TOKENS;
    if (debug) {
      process.stderr.write(
        `[visual-ai-assertions] Auto-increased maxTokens from ${DEFAULT_MAX_TOKENS} to ${OPENAI_REASONING_MAX_TOKENS} for OpenAI with reasoningEffort "${config.reasoningEffort}".\n`,
      );
    }
  }

  return {
    provider,
    apiKey: config.apiKey,
    model,
    maxTokens,
    reasoningEffort: config.reasoningEffort,
    debug,
    debugPrompt,
    debugResponse,
    trackUsage:
      config.trackUsage ??
      parseBooleanEnv("VISUAL_AI_TRACK_USAGE", process.env.VISUAL_AI_TRACK_USAGE) ??
      false,
  };
}
