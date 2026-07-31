import { buildAiDiffCodeExecutionPrompt } from "../core/prompt.js";
import {
  VisualAIAuthError,
  VisualAIConfigError,
  VisualAIProviderError,
  VisualAITruncationError,
} from "../errors.js";
import { mapProviderError } from "./error-mapper.js";
import type { NormalizedImage } from "../types.js";
import type { ImageDetailLevel, ReasoningEffortLevel } from "../constants.js";
import type {
  ImageGenerationOptions,
  ImageGenerationResponse,
  ProviderConfig,
  ProviderDriver,
  RawProviderResponse,
  SendMessageOptions,
} from "./types.js";

const DEFAULT_IMAGE_GEN_MODEL = "gemini-2.5-flash-image";

/** Gemini 3+ models use code execution for image generation instead of responseModalities. */
export function needsCodeExecution(model: string): boolean {
  const match = model.match(/^gemini-(\d+)/);
  return match !== null && match[1] !== undefined && parseInt(match[1], 10) >= 3;
}

/** Response parts from Gemini API. Code execution responses include executableCode/codeExecutionResult
 *  parts alongside inlineData; these fields are kept for type accuracy of the full response shape. */
interface GeminiImagePart {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
  executableCode?: {
    code: string;
    language?: string;
  };
  codeExecutionResult?: {
    outcome?: string;
    output?: string;
  };
}

/** Minimal interface for the Google GenAI SDK client used by this driver. */
interface GoogleGenerateContentResponse {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: GeminiImagePart[];
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

interface GoogleClient {
  models: {
    generateContent(params: Record<string, unknown>): Promise<GoogleGenerateContentResponse>;
  };
}

/**
 * 1:1 mapping so "medium" means native medium, matching the other providers.
 * (Until v0.17 this was shifted one level down — medium -> "low" — which left
 * Gemini models thinking far less than peers at the same configured effort.)
 * Google has no level above "high", so xhigh clamps; "minimal" is unused,
 * which also sidesteps models that reject it (e.g. Gemini 3.1 Pro).
 */
const GOOGLE_THINKING_LEVEL = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
} as const satisfies Record<ReasoningEffortLevel, string>;

/**
 * Maps the abstract image-detail hint to Gemini's `mediaResolution` token-budget
 * tier (LOW 280 → HIGH 1120 tokens/image). "auto" is omitted so Gemini's own
 * default resolution applies. Gemini 3 also offers MEDIA_RESOLUTION_ULTRA_HIGH
 * (2240 tokens) if an even higher tier is ever wanted.
 */
const GOOGLE_MEDIA_RESOLUTION: Partial<Record<ImageDetailLevel, string>> = {
  low: "MEDIA_RESOLUTION_LOW",
  high: "MEDIA_RESOLUTION_HIGH",
};

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

/**
 * Normalize Gemini usage. Gemini reports the visible answer
 * (`candidatesTokenCount`) and the thinking trace (`thoughtsTokenCount`)
 * separately, but bills thinking at the output-token rate. We fold thinking into
 * `outputTokens` so the count matches what's billed (and matches OpenAI/OpenRouter,
 * whose output counts already include reasoning), and expose `reasoningTokens` as
 * the breakdown. Without this, cost estimates omit Gemini's thinking entirely.
 */
function toGeminiUsage(um: GeminiUsageMetadata | undefined) {
  if (!um) return undefined;
  const thoughts = um.thoughtsTokenCount ?? 0;
  return {
    inputTokens: um.promptTokenCount ?? 0,
    outputTokens: (um.candidatesTokenCount ?? 0) + thoughts,
    ...(um.thoughtsTokenCount !== undefined && { reasoningTokens: um.thoughtsTokenCount }),
  };
}

export class GoogleDriver implements ProviderDriver {
  private client: GoogleClient | null;
  private model: string;
  private maxTokens: number;
  private apiKeyOrEnv: string | undefined;
  private reasoningEffort: ProviderConfig["reasoningEffort"];
  private imageDetail: ProviderConfig["imageDetail"];

  constructor(config: ProviderConfig) {
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.client = null;
    this.apiKeyOrEnv = config.apiKey;
    this.reasoningEffort = config.reasoningEffort;
    this.imageDetail = config.imageDetail;
  }

  private toGeminiParts(images: NormalizedImage[]) {
    return images.map((img) => ({
      inlineData: { data: img.base64, mimeType: img.mimeType },
    }));
  }

  private async getClient(): Promise<GoogleClient> {
    if (this.client) return this.client;

    let GoogleGenAI: unknown;
    try {
      const mod: unknown = await import("@google/genai");
      GoogleGenAI = (mod as { GoogleGenAI: unknown }).GoogleGenAI;
    } catch {
      throw new VisualAIConfigError(
        "Google GenAI SDK not installed. Run: npm install @google/genai",
      );
    }

    const apiKey = this.apiKeyOrEnv ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new VisualAIAuthError(
        "Google API key not found. Set GOOGLE_API_KEY or pass apiKey in config.",
      );
    }

    this.client = new (GoogleGenAI as new (opts: { apiKey: string }) => GoogleClient)({ apiKey });
    return this.client;
  }

  async sendMessage(
    images: NormalizedImage[],
    prompt: string,
    _options?: SendMessageOptions,
  ): Promise<RawProviderResponse> {
    const client = await this.getClient();

    try {
      const response = await client.models.generateContent({
        model: this.model,
        contents: [...this.toGeminiParts(images), prompt],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: this.maxTokens,
          ...(this.reasoningEffort && {
            thinkingConfig: {
              thinkingLevel: GOOGLE_THINKING_LEVEL[this.reasoningEffort],
            },
          }),
          ...(this.imageDetail &&
            GOOGLE_MEDIA_RESOLUTION[this.imageDetail] && {
              mediaResolution: GOOGLE_MEDIA_RESOLUTION[this.imageDetail],
            }),
        },
      });

      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === "MAX_TOKENS") {
        throw new VisualAITruncationError(
          `Response truncated: Google returned finishReason "MAX_TOKENS". The model exhausted the output token budget (${this.maxTokens} tokens). Increase maxTokens in your config or lower reasoningEffort.`,
          response.text ?? "",
          this.maxTokens,
        );
      }
      if (finishReason && finishReason !== "STOP") {
        throw new VisualAIProviderError(
          `Response blocked: Google returned finishReason "${finishReason}".`,
        );
      }

      const text = response.text ?? "";

      return {
        text,
        usage: toGeminiUsage(response.usageMetadata),
      };
    } catch (err) {
      if (err instanceof VisualAITruncationError || err instanceof VisualAIProviderError) throw err;
      throw mapProviderError(err);
    }
  }

  async generateImage(
    images: NormalizedImage[],
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse> {
    const client = await this.getClient();
    const imageModel = options?.model ?? DEFAULT_IMAGE_GEN_MODEL;
    const resolvedPrompt =
      options?.promptKind === "ai-diff" && needsCodeExecution(imageModel)
        ? buildAiDiffCodeExecutionPrompt()
        : prompt;

    // Gemini 3+ models require code execution to generate images;
    // older models use native image generation via responseModalities.
    const config = needsCodeExecution(imageModel)
      ? { tools: [{ codeExecution: {} }] }
      : { responseModalities: ["TEXT", "IMAGE"] };

    try {
      const response = await client.models.generateContent({
        model: imageModel,
        contents: [...this.toGeminiParts(images), resolvedPrompt],
        config,
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (!parts) {
        throw new VisualAIProviderError("Gemini image generation returned no response parts");
      }

      const imagePart = parts.find((p) => p.inlineData?.data);
      if (!imagePart?.inlineData) {
        throw new VisualAIProviderError(
          "Gemini image generation returned no image data. Ensure the model supports image output.",
        );
      }

      return {
        imageData: Buffer.from(imagePart.inlineData.data, "base64"),
        mimeType: imagePart.inlineData.mimeType,
        usage: toGeminiUsage(response.usageMetadata),
      };
    } catch (err) {
      if (err instanceof VisualAIProviderError) throw err;
      throw mapProviderError(err);
    }
  }
}
