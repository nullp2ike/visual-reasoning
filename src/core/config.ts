import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODELS,
  MODEL_TO_PROVIDER,
  VALID_PROVIDERS,
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
  if (config.provider) {
    if (!VALID_PROVIDERS.includes(config.provider)) {
      throw new VisualAIConfigError(
        `Unknown provider: "${config.provider}". Supported: ${VALID_PROVIDERS.join(", ")}`,
      );
    }
    return config.provider;
  }

  const envProvider = process.env.VISUAL_AI_PROVIDER;
  if (envProvider) {
    if (VALID_PROVIDERS.includes(envProvider as ProviderName)) {
      return envProvider as ProviderName;
    }
    throw new VisualAIConfigError(
      `Invalid VISUAL_AI_PROVIDER: "${envProvider}". Supported: ${VALID_PROVIDERS.join(", ")}`,
    );
  }

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
    "No provider specified. Set `provider` in config, `VISUAL_AI_PROVIDER` env variable, or an API key env variable (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY).",
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

export function resolveConfig(config: VisualAIConfig): ResolvedConfig {
  const provider = resolveProvider(config);
  const model = config.model ?? process.env.VISUAL_AI_MODEL ?? DEFAULT_MODELS[provider];

  const modelProvider = inferProviderFromModel(model);
  if (modelProvider && modelProvider !== provider) {
    throw new VisualAIConfigError(
      `Model "${model}" appears to be a ${modelProvider} model, but provider is "${provider}". Either change the provider or use a ${provider}-compatible model.`,
    );
  }

  return {
    provider,
    apiKey: config.apiKey,
    model,
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    reasoningEffort: config.reasoningEffort,
    debug: config.debug ?? parseBooleanEnv("VISUAL_AI_DEBUG", process.env.VISUAL_AI_DEBUG) ?? false,
    trackUsage:
      config.trackUsage ??
      parseBooleanEnv("VISUAL_AI_TRACK_USAGE", process.env.VISUAL_AI_TRACK_USAGE) ??
      false,
  };
}
