import { Model, type ReasoningEffortLevel } from "../constants.js";
import { VisualAIAuthError, VisualAIConfigError, VisualAITruncationError } from "../errors.js";
import { mapProviderError } from "./error-mapper.js";
import type { NormalizedImage } from "../types.js";
import type {
  ProviderConfig,
  ProviderDriver,
  RawProviderResponse,
  SendMessageOptions,
} from "./types.js";

// Opus 4.7 introduced a dedicated "xhigh" effort tier. Older Anthropic models
// (Opus 4.6, Sonnet 4.6) reject "xhigh" but accept "max", which is why our
// xhigh has historically mapped to "max" everywhere.
function mapEffort(level: ReasoningEffortLevel, model: string): string {
  if (level !== "xhigh") return level;
  return model === Model.Anthropic.OPUS_4_7 ? "xhigh" : "max";
}

/** Minimal interface for the Anthropic SDK client used by this driver. */
interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
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

  async sendMessage(
    images: NormalizedImage[],
    prompt: string,
    _options?: SendMessageOptions,
  ): Promise<RawProviderResponse> {
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
          effort: mapEffort(this.reasoningEffort, this.model),
        };
      }

      const message = await client.messages.create(requestParams);

      const textBlock = message.content.find((block) => block.type === "text");
      const text = textBlock?.text ?? "";

      if (message.stop_reason === "max_tokens") {
        throw new VisualAITruncationError(
          `Response truncated: Anthropic stopped due to max_tokens limit (${this.maxTokens} tokens). Increase maxTokens in your config or lower reasoningEffort.`,
          text,
          this.maxTokens,
        );
      }

      return {
        text,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (err) {
      if (err instanceof VisualAITruncationError) throw err;
      throw mapProviderError(err);
    }
  }
}
