import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { Model } from "../../src/constants.js";
import { generateAiDiff } from "../../src/core/diff.js";
import { VisualAIConfigError } from "../../src/errors.js";
import type { NormalizedImage } from "../../src/types.js";
import type { ProviderDriver, ImageGenerationResponse } from "../../src/providers/types.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

async function loadFixture(filename: string): Promise<NormalizedImage> {
  const data = await readFile(join(FIXTURES_DIR, filename));
  return {
    data,
    mimeType: "image/png",
    base64: data.toString("base64"),
  };
}

describe("generateAiDiff", () => {
  function makeDriverWithGenerateImage(imageResponse: ImageGenerationResponse): ProviderDriver {
    return {
      sendMessage: vi.fn(),
      generateImage: vi.fn().mockResolvedValue(imageResponse),
    };
  }

  function makeDriverWithoutGenerateImage(): ProviderDriver {
    return {
      sendMessage: vi.fn(),
    };
  }

  it("throws VisualAIConfigError when driver does not support generateImage", async () => {
    const img = await loadFixture("diff-base.png");
    const driver = makeDriverWithoutGenerateImage();

    await expect(generateAiDiff(img, img, "gemini-3-flash-preview", driver)).rejects.toThrow(
      VisualAIConfigError,
    );
    await expect(generateAiDiff(img, img, "gemini-3-flash-preview", driver)).rejects.toThrow(
      /provider that supports image generation/,
    );
  });

  it("returns DiffImageResult from AI-generated image", async () => {
    const img = await loadFixture("diff-base.png");
    // Create a real 10x10 red PNG for the mock to return
    const fakePng = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const driver = makeDriverWithGenerateImage({
      imageData: fakePng,
      mimeType: "image/png",
    });

    const result = await generateAiDiff(img, img, Model.Google.GEMINI_3_FLASH_PREVIEW, driver);

    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
    expect(result.data).toBeInstanceOf(Buffer);

    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe("png");
  });

  it("passes the resolved model to generateImage", async () => {
    const img = await loadFixture("diff-base.png");
    const fakePng = await sharp({
      create: { width: 5, height: 5, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const mockGenerateImage = vi.fn().mockResolvedValue({
      imageData: fakePng,
      mimeType: "image/png",
    });
    const driver: ProviderDriver = {
      sendMessage: vi.fn(),
      generateImage: mockGenerateImage,
    };

    await generateAiDiff(img, img, "gemini-3-flash-preview", driver);

    expect(mockGenerateImage).toHaveBeenCalledWith(expect.anything(), expect.any(String), {
      model: "gemini-3-flash-preview",
      promptKind: "ai-diff",
    });
  });

  it("always passes the generic diff prompt from core", async () => {
    const img = await loadFixture("diff-base.png");
    const fakePng = await sharp({
      create: { width: 5, height: 5, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const mockGenerateImage = vi.fn().mockResolvedValue({
      imageData: fakePng,
      mimeType: "image/png",
    });
    const driver: ProviderDriver = {
      sendMessage: vi.fn(),
      generateImage: mockGenerateImage,
    };

    await generateAiDiff(img, img, Model.Google.GEMINI_3_FLASH_PREVIEW, driver);

    const prompt = mockGenerateImage.mock.calls[0]![1] as string;
    expect(prompt).not.toContain("Python");
    expect(prompt).toContain("annotated image");
  });

  it("throws when model does not support annotated diff generation", async () => {
    const img = await loadFixture("diff-base.png");
    const driver = makeDriverWithGenerateImage({
      imageData: Buffer.from("ignored"),
      mimeType: "image/png",
    });

    await expect(
      generateAiDiff(img, img, Model.Google.GEMINI_3_1_PRO_PREVIEW, driver),
    ).rejects.toThrow(VisualAIConfigError);
    await expect(
      generateAiDiff(img, img, Model.Google.GEMINI_3_1_PRO_PREVIEW, driver),
    ).rejects.toThrow(/only supported.*gemini-3-flash-preview/i);
  });
});
