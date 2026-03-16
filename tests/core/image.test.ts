import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeImage } from "../../src/core/image.js";
import { VisualAIImageError } from "../../src/errors.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

describe("normalizeImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Buffer input", () => {
    it("normalizes a PNG buffer", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.png"));
      const result = await normalizeImage(data);
      expect(result.mimeType).toBe("image/png");
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.base64).toBeTruthy();
    });

    it("normalizes a JPEG buffer", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.jpg"));
      const result = await normalizeImage(data);
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("normalizes a WebP buffer", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.webp"));
      const result = await normalizeImage(data);
      expect(result.mimeType).toBe("image/webp");
    });

    it("normalizes a GIF buffer", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.gif"));
      const result = await normalizeImage(data);
      expect(result.mimeType).toBe("image/gif");
    });

    it("throws on corrupt data", async () => {
      const data = await readFile(join(FIXTURES_DIR, "corrupt.png"));
      await expect(normalizeImage(data)).rejects.toThrow(VisualAIImageError);
    });
  });

  describe("Uint8Array input", () => {
    it("normalizes a Uint8Array", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.png"));
      const uint8 = new Uint8Array(data);
      const result = await normalizeImage(uint8);
      expect(result.mimeType).toBe("image/png");
      expect(result.data).toBeInstanceOf(Buffer);
    });
  });

  describe("file path input", () => {
    it("loads from an absolute file path", async () => {
      const path = join(FIXTURES_DIR, "small.png");
      const result = await normalizeImage(path);
      expect(result.mimeType).toBe("image/png");
      expect(result.base64).toBeTruthy();
    });

    it("detects mime type from extension", async () => {
      const result = await normalizeImage(join(FIXTURES_DIR, "small.jpg"));
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("throws on nonexistent file", async () => {
      await expect(normalizeImage(join(FIXTURES_DIR, "nonexistent.png"))).rejects.toThrow(
        VisualAIImageError,
      );
    });

    it("loads from a ./ relative file path", async () => {
      const result = await normalizeImage("./tests/fixtures/small.png");
      expect(result.mimeType).toBe("image/png");
    });

    it("loads from a ../ relative file path", async () => {
      const result = await normalizeImage("../visual-reasoning/tests/fixtures/small.png");
      expect(result.mimeType).toBe("image/png");
    });
  });

  describe("URL input", () => {
    it("fetches and normalizes an image from a URL", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.png"));
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(data, {
          status: 200,
          headers: { "content-type": "image/png; charset=utf-8" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await normalizeImage("https://example.com/image.png");

      expect(result.mimeType).toBe("image/png");
      expect(result.data).toEqual(data);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/image.png",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("wraps fetch errors as VisualAIImageError", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("The operation timed out")));

      await expect(normalizeImage("https://example.com/slow.png")).rejects.toThrow(
        "Failed to fetch image from URL: https://example.com/slow.png — The operation timed out",
      );
    });

    it("throws on non-200 responses", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response("missing", { status: 404, statusText: "Not Found" })),
      );

      await expect(normalizeImage("https://example.com/missing.png")).rejects.toThrow(
        "Failed to fetch image from URL: https://example.com/missing.png — HTTP 404",
      );
    });

    it("falls back to magic-byte detection when content-type is unsupported", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.png"));
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(data, {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          }),
        ),
      );

      const result = await normalizeImage("https://example.com/fallback");
      expect(result.mimeType).toBe("image/png");
    });
  });

  describe("base64 input", () => {
    it("decodes raw base64", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.png"));
      const base64 = data.toString("base64");
      const result = await normalizeImage(base64);
      expect(result.mimeType).toBe("image/png");
    });

    it("decodes raw base64 PNG containing / characters", async () => {
      // Real screenshots from browser.takeScreenshot() are large and contain /
      const data = await readFile(join(FIXTURES_DIR, "oversized.png"));
      const base64 = data.toString("base64");
      expect(base64).toContain("/"); // Confirms the base64 has / chars
      const result = await normalizeImage(base64);
      expect(result.mimeType).toBe("image/png");
      expect(result.data).toBeInstanceOf(Buffer);
    });

    it("decodes raw base64 JPEG (starts with /9j/)", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.jpg"));
      const base64 = data.toString("base64");
      expect(base64.startsWith("/9j/")).toBe(true);
      const result = await normalizeImage(base64);
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("decodes raw base64 WebP", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.webp"));
      const base64 = data.toString("base64");
      const result = await normalizeImage(base64);
      expect(result.mimeType).toBe("image/webp");
    });

    it("decodes raw base64 GIF", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.gif"));
      const base64 = data.toString("base64");
      const result = await normalizeImage(base64);
      expect(result.mimeType).toBe("image/gif");
    });

    it("decodes data URL", async () => {
      const data = await readFile(join(FIXTURES_DIR, "small.png"));
      const dataUrl = `data:image/png;base64,${data.toString("base64")}`;
      const result = await normalizeImage(dataUrl);
      expect(result.mimeType).toBe("image/png");
    });

    it("throws on invalid base64", async () => {
      await expect(normalizeImage("data:image/png;base64,!!!invalid")).rejects.toThrow(
        VisualAIImageError,
      );
    });

    it("throws when base64 decodes to an empty image", async () => {
      await expect(normalizeImage("data:image/png;base64,A")).rejects.toThrow(
        "Empty image data after base64 decode",
      );
    });
  });

  describe("invalid input", () => {
    it("rejects unrecognized strings", async () => {
      await expect(normalizeImage("definitely-not-an-image")).rejects.toThrow(
        'Unrecognized image input: "definitely-not-an-image"',
      );
    });

    it("rejects unsupported runtime input types", async () => {
      const invalidInput = 123 as unknown as Parameters<typeof normalizeImage>[0];
      await expect(normalizeImage(invalidInput)).rejects.toThrow(
        "Invalid image input: expected Buffer, Uint8Array, file path, URL, or base64 string",
      );
    });
  });

  describe("auto-resize", () => {
    it("resizes oversized images", async () => {
      const path = join(FIXTURES_DIR, "oversized.png");
      const result = await normalizeImage(path);
      const sharp = (await import("sharp")).default;
      const meta = await sharp(result.data).metadata();
      expect(meta.width).toBeLessThanOrEqual(1568);
      expect(meta.height).toBeLessThanOrEqual(1568);
    });

    it("does not resize small images", async () => {
      const path = join(FIXTURES_DIR, "small.png");
      const original = await readFile(path);
      const result = await normalizeImage(path);
      expect(result.data.length).toBe(original.length);
    });
  });
});
