import { VisualAIAuthError, VisualAIConfigError } from "../errors.js";
import { mapProviderError } from "./error-mapper.js";
import type { NormalizedImage } from "../types.js";
import type { ProviderConfig, ProviderDriver, RawProviderResponse } from "./types.js";

/** Minimal interface for the Anthropic SDK client used by this driver. */
interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

interface AnthropicClient {
  messages: {
    create(params: Record<string, unknown>): Promise<AnthropicMessage>;
  };
}

export class AnthropicDriver implements ProviderDriver {
  private client: AnthropicClient | null;
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

  private async getClient(): Promise<AnthropicClient> {
    if (this.client) return this.client;

    let Anthropic: unknown;
    try {
      const mod: unknown = await import("@anthropic-ai/sdk");
      Anthropic = (mod as { default: unknown }).default;
    } catch {
      throw new VisualAIConfigError(
        "Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk",
      );
    }

    const apiKey = this.apiKeyOrEnv ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new VisualAIAuthError(
        "Anthropic API key not found. Set ANTHROPIC_API_KEY or pass apiKey in config.",
      );
    }

    this.client = new (Anthropic as new (opts: { apiKey: string }) => AnthropicClient)({ apiKey });
    return this.client;
  }

  async sendMessage(images: NormalizedImage[], prompt: string): Promise<RawProviderResponse> {
    const client = await this.getClient();

    const imageBlocks = images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mimeType,
        data: img.base64,
      },
    }));

    try {
      const requestParams: Record<string, unknown> = {
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: "user",
            content: [...imageBlocks, { type: "text" as const, text: prompt }],
          },
        ],
      };

      if (this.reasoningEffort) {
        requestParams.thinking = { type: "adaptive" };
        requestParams.output_config = {
          effort: this.reasoningEffort === "xhigh" ? "max" : this.reasoningEffort,
        };
      }

      const message = await client.messages.create(requestParams);

      const textBlock = message.content.find((block) => block.type === "text");
      const text = textBlock?.text ?? "";

      return {
        text,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (err) {
      throw mapProviderError(err);
    }
  }
}
