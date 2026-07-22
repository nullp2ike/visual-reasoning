import {
  VisualAIAuthError,
  VisualAIConfigError,
  VisualAIProviderError,
  VisualAITruncationError,
} from "../errors.js";
import { mapProviderError } from "./error-mapper.js";
import type { NormalizedImage } from "../types.js";
import type { ReasoningEffortLevel } from "../constants.js";
import type {
  ProviderConfig,
  ProviderDriver,
  RawProviderResponse,
  SendMessageOptions,
} from "./types.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter normalizes reasoning across upstream vendors to low/medium/high;
 * there is no xhigh, so it clamps to high.
 */
const OPENROUTER_REASONING_EFFORT: Record<ReasoningEffortLevel, "low" | "medium" | "high"> = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
};

/** Minimal interface for the OpenAI SDK chat-completions surface used by this driver. */
interface OpenRouterCompletionResult {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

interface OpenRouterClient {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<OpenRouterCompletionResult>;
    };
  };
}

/**
 * Driver for models routed through OpenRouter (xAI, Moonshot, Qwen, ...).
 * Speaks the OpenAI chat-completions protocol via the `openai` SDK pointed at
 * the OpenRouter base URL, so no additional SDK dependency is required.
 */
export class OpenRouterDriver implements ProviderDriver {
  private client: OpenRouterClient | null;
  private model: string;
  private maxTokens: number;
  private apiKeyOrEnv: string | undefined;
  private reasoningEffort: ProviderConfig["reasoningEffort"];

  constructor(config: ProviderConfig) {
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.client = null;
    this.apiKeyOrEnv = config.apiKey;
    this.reasoningEffort = config.reasoningEffort;
  }

  private async getClient(): Promise<OpenRouterClient> {
    if (this.client) return this.client;

    let OpenAI: unknown;
    try {
      const mod: unknown = await import("openai");
      OpenAI = (mod as { default: unknown }).default;
    } catch {
      throw new VisualAIConfigError(
        "OpenAI SDK not installed (required for the OpenRouter provider). Run: npm install openai",
      );
    }

    const apiKey = this.apiKeyOrEnv ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new VisualAIAuthError(
        "OpenRouter API key not found. Set OPENROUTER_API_KEY or pass apiKey in config.",
      );
    }

    this.client = new (OpenAI as new (opts: {
      apiKey: string;
      baseURL: string;
    }) => OpenRouterClient)({ apiKey, baseURL: OPENROUTER_BASE_URL });
    return this.client;
  }

  async sendMessage(
    images: NormalizedImage[],
    prompt: string,
    options?: SendMessageOptions,
  ): Promise<RawProviderResponse> {
    const client = await this.getClient();

    const imageParts = images.map((img) => ({
      type: "image_url" as const,
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    }));

    try {
      const responseFormat = options?.responseSchema
        ? {
            type: "json_schema" as const,
            json_schema: {
              name: "visual_ai_response",
              strict: true,
              schema: options.responseSchema,
            },
          }
        : { type: "json_object" as const };

      const requestParams: Record<string, unknown> = {
        model: this.model,
        max_tokens: this.maxTokens,
        response_format: responseFormat,
        messages: [
          {
            role: "user",
            content: [...imageParts, { type: "text" as const, text: prompt }],
          },
        ],
        // OpenRouter-specific: include token accounting in the response.
        usage: { include: true },
      };

      if (this.reasoningEffort) {
        requestParams.reasoning = { effort: OPENROUTER_REASONING_EFFORT[this.reasoningEffort] };
      }

      const response = await client.chat.completions.create(requestParams);

      const choice = response.choices?.[0];
      if (!choice?.message) {
        throw new VisualAIProviderError("OpenRouter returned an empty response (no choices).");
      }

      const text = choice.message.content ?? "";

      if (choice.finish_reason === "length") {
        throw new VisualAITruncationError(
          `Response truncated: OpenRouter returned finish_reason "length". The model exhausted the output token budget (${this.maxTokens} tokens). This commonly happens with higher reasoning effort levels. Increase maxTokens in your config (e.g., maxTokens: 16384) or lower reasoningEffort.`,
          text,
          this.maxTokens,
        );
      }

      const reasoningTokens = response.usage?.completion_tokens_details?.reasoning_tokens;

      return {
        text,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
              ...(reasoningTokens !== undefined && { reasoningTokens }),
            }
          : undefined,
      };
    } catch (err) {
      if (err instanceof VisualAITruncationError || err instanceof VisualAIProviderError) {
        throw err;
      }
      throw mapProviderError(err);
    }
  }
}
