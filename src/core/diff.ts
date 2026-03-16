import { Model } from "../constants.js";
import sharp from "sharp";
import { VisualAIConfigError } from "../errors.js";
import type { DiffImageResult, NormalizedImage } from "../types.js";
import { buildAiDiffPrompt } from "./prompt.js";

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

  if (model !== Model.Google.GEMINI_3_FLASH_PREVIEW) {
    throw new VisualAIConfigError(
      "Annotated diff images are only supported when visualAI is configured with the Google model gemini-3-flash-preview.",
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
