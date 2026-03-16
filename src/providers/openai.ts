import { VisualAIAuthError, VisualAIConfigError } from "../errors.js";
import { mapProviderError } from "./error-mapper.js";
import type { NormalizedImage } from "../types.js";
import type { ProviderConfig, ProviderDriver, RawProviderResponse } from "./types.js";

/** Minimal interface for the OpenAI SDK client used by this driver. */
interface OpenAIResponseResult {
  output_text?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

interface OpenAIClient {
  responses: {
    create(params: Record<string, unknown>): Promise<OpenAIResponseResult>;
  };
}

export class OpenAIDriver implements ProviderDriver {
  private client: OpenAIClient | null;
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

  private async getClient(): Promise<OpenAIClient> {
    if (this.client) return this.client;

    let OpenAI: unknown;
    try {
      const mod: unknown = await import("openai");
      OpenAI = (mod as { default: unknown }).default;
    } catch {
      throw new VisualAIConfigError("OpenAI SDK not installed. Run: npm install openai");
    }

    const apiKey = this.apiKeyOrEnv ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new VisualAIAuthError(
        "OpenAI API key not found. Set OPENAI_API_KEY or pass apiKey in config.",
      );
    }

    this.client = new (OpenAI as new (opts: { apiKey: string }) => OpenAIClient)({ apiKey });
    return this.client;
  }

  async sendMessage(images: NormalizedImage[], prompt: string): Promise<RawProviderResponse> {
    const client = await this.getClient();

    const imageBlocks = images.map((img) => ({
      type: "input_image" as const,
      image_url: `data:${img.mimeType};base64,${img.base64}`,
    }));

    try {
      const requestParams: Record<string, unknown> = {
        model: this.model,
        max_output_tokens: this.maxTokens,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "user",
            content: [...imageBlocks, { type: "input_text" as const, text: prompt }],
          },
        ],
      };

      if (this.reasoningEffort) {
        requestParams.reasoning = { effort: this.reasoningEffort };
      }

      const response = await client.responses.create(requestParams);

      const text = response.output_text ?? "";

      return {
        text,
        usage: response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            }
          : undefined,
      };
    } catch (err) {
      throw mapProviderError(err);
    }
  }
}
