import { Model } from "../constants.js";
import sharp from "sharp";
import { VisualAIConfigError } from "../errors.js";
import type { DiffImageResult, NormalizedImage } from "../types.js";
import { buildAiDiffPrompt } from "./prompt.js";

/**
 * Models that return annotated diff images via Gemini code execution: the whole
 * Gemini flash tier. `compare()` auto-enables a diff image on every model in
 * this set, and `generateAiDiff` refuses any model outside it.
 *
 * The Flash-Lite models (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`) and
 * the Pro tier (`gemini-3.1-pro-preview`) are deliberately absent: they do not
 * drive code execution reliably enough to annotate an image.
 */
export const DIFF_ALLOWED_MODELS: ReadonlySet<string> = new Set([
  Model.Google.GEMINI_3_FLASH_PREVIEW,
  Model.Google.GEMINI_3_5_FLASH,
  Model.Google.GEMINI_3_6_FLASH,
  Model.Google.GEMINI_3_7_FLASH,
  Model.Google.GEMINI_3_8_FLASH,
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
