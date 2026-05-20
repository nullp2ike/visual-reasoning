import { Model } from "../constants.js";
import sharp from "sharp";
import { VisualAIConfigError } from "../errors.js";
import type { DiffImageResult, NormalizedImage } from "../types.js";
import { buildAiDiffPrompt } from "./prompt.js";

/**
 * Models proven to return annotated diff images via Gemini code execution.
 * `gemini-3-flash-preview` is the baseline; `gemini-3.5-flash` is opt-in
 * (mechanism works but annotation quality has not been validated end-to-end).
 */
export const DIFF_ALLOWED_MODELS: ReadonlySet<string> = new Set([
  Model.Google.GEMINI_3_FLASH_PREVIEW,
  Model.Google.GEMINI_3_5_FLASH,
]);

interface ImageGenerationDriver {
  generateImage?: (
    images: NormalizedImage[],
    prompt: string,
    options?: { model?: string; promptKind?: "ai-diff" },
  ) => Promise<{
    imageData: Buffer;
    mimeType: string;
  }>;
}

export async function generateAiDiff(
  imgA: NormalizedImage,
  imgB: NormalizedImage,
  model: string,
  driver: ImageGenerationDriver,
): Promise<DiffImageResult> {
  if (!driver.generateImage) {
    throw new VisualAIConfigError(
      "AI-generated diff images require a provider that supports image generation. Currently only the Google (Gemini) provider supports this.",
    );
  }

  if (!DIFF_ALLOWED_MODELS.has(model)) {
    throw new VisualAIConfigError(
      `Annotated diff images are only supported with these Google models: ${[...DIFF_ALLOWED_MODELS].join(", ")}.`,
    );
  }

  const response = await driver.generateImage([imgA, imgB], buildAiDiffPrompt(), {
    model,
    promptKind: "ai-diff",
  });

  const img = sharp(response.imageData);
  const meta = await img.metadata();
  const pngData = await img.png().toBuffer();

  return {
    data: pngData,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    mimeType: "image/png",
  };
}
