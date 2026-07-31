import type { NormalizedImage } from "../types.js";
import type { ImageDetailLevel, ReasoningEffortLevel } from "../constants.js";

export interface ProviderConfig {
  apiKey: string | undefined;
  model: string;
  maxTokens: number;
  reasoningEffort?: ReasoningEffortLevel;
  /**
   * Image-detail hint. Drivers that support it map to their native field
   * (OpenAI/OpenRouter `detail`, Google `mediaResolution`). `"auto"` or
   * undefined sends nothing. The pixel cap itself is applied earlier during
   * image normalization, so it is not part of this config.
   */
  imageDetail?: ImageDetailLevel;
}

export interface RawProviderResponse {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    /** Actual cost in USD reported by the provider, when it returns one (OpenRouter). */
    cost?: number;
  };
}

export interface ImageGenerationResponse {
  imageData: Buffer;
  mimeType: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ImageGenerationOptions {
  model?: string;
  promptKind?: "ai-diff";
}

export interface SendMessageOptions {
  /** JSON Schema for structured output. Currently used by OpenAI only. */
  responseSchema?: Record<string, unknown>;
}

export interface ProviderDriver {
  sendMessage(
    images: NormalizedImage[],
    prompt: string,
    options?: SendMessageOptions,
  ): Promise<RawProviderResponse>;
  generateImage?(
    images: NormalizedImage[],
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse>;
}
