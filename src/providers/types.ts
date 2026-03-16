import type { NormalizedImage, ReasoningEffort } from "../types.js";

export interface ProviderConfig {
  apiKey: string | undefined;
  model: string;
  maxTokens: number;
  reasoningEffort?: ReasoningEffort;
}

export interface RawProviderResponse {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
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

export interface ProviderDriver {
  sendMessage(images: NormalizedImage[], prompt: string): Promise<RawProviderResponse>;
  generateImage?(
    images: NormalizedImage[],
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse>;
}
