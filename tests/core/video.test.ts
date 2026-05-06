import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectVideoMimeType,
  extractFrames,
  getVideoMimeFromExtension,
  isSupportedVideoMimeType,
  probeDurationSeconds,
  resolveVideoToPath,
} from "../../src/core/video.js";
import { VisualAIVideoError } from "../../src/errors.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");
const SMALL_MP4 = join(FIXTURES_DIR, "small.mp4");
const SMALL_WEBM = join(FIXTURES_DIR, "small.webm");
const OVERSIZED_MP4 = join(FIXTURES_DIR, "oversized.mp4");

describe("detectVideoMimeType", () => {
  it("detects MP4 from ftyp signature", async () => {
    const buf = await readFile(SMALL_MP4);
    expect(detectVideoMimeType(buf)).toBe("video/mp4");
  });

  it("detects WebM from EBML signature", async () => {
    const buf = await readFile(SMALL_WEBM);
    expect(detectVideoMimeType(buf)).toBe("video/webm");
  });

  it("returns null for an image buffer", async () => {
    const buf = await readFile(join(FIXTURES_DIR, "small.png"));
    expect(detectVideoMimeType(buf)).toBeNull();
  });

  it("returns null for buffers shorter than 12 bytes", () => {
    expect(detectVideoMimeType(Buffer.from([0, 0, 0]))).toBeNull();
  });
});

describe("getVideoMimeFromExtension", () => {
  it.each([
    [".mp4", "video/mp4"],
    [".M4V", "video/mp4"],
    [".webm", "video/webm"],
    [".mov", "video/quicktime"],
    [".mkv", "video/x-matroska"],
  ])("maps %s to %s", (ext, expected) => {
    expect(getVideoMimeFromExtension(`clip${ext}`)).toBe(expected);
  });

  it("returns undefined for unsupported extensions", () => {
    expect(getVideoMimeFromExtension("clip.avi")).toBeUndefined();
    expect(getVideoMimeFromExtension("clip.png")).toBeUndefined();
  });
});

describe("isSupportedVideoMimeType", () => {
  it("recognises every supported MIME type", () => {
    expect(isSupportedVideoMimeType("video/mp4")).toBe(true);
    expect(isSupportedVideoMimeType("video/webm")).toBe(true);
    expect(isSupportedVideoMimeType("video/quicktime")).toBe(true);
    expect(isSupportedVideoMimeType("video/x-matroska")).toBe(true);
  });

  it("rejects unrelated MIME types", () => {
    expect(isSupportedVideoMimeType("video/avi")).toBe(false);
    expect(isSupportedVideoMimeType("image/png")).toBe(false);
  });
});

describe("resolveVideoToPath", () => {
  it("returns a file path unchanged for a known video extension", async () => {
    const result = await resolveVideoToPath(SMALL_MP4);
    try {
      expect(result.path).toBe(SMALL_MP4);
      expect(result.mimeType).toBe("video/mp4");
    } finally {
      await result.cleanup();
    }
  });

  it("rejects file paths with unsupported extensions", async () => {
    await expect(resolveVideoToPath("./clip.avi")).rejects.toThrow(VisualAIVideoError);
  });

  it("writes a Buffer to a temporary file when given raw bytes", async () => {
    const data = await readFile(SMALL_WEBM);
    const result = await resolveVideoToPath(data);
    try {
      expect(result.mimeType).toBe("video/webm");
      expect(result.path).not.toBe(SMALL_WEBM);
      const written = await readFile(result.path);
      expect(written.length).toBe(data.length);
    } finally {
      await result.cleanup();
    }
  });

  it("rejects buffers that don't match a known video signature", async () => {
    const data = await readFile(join(FIXTURES_DIR, "small.png"));
    await expect(resolveVideoToPath(data)).rejects.toThrow(VisualAIVideoError);
  });

  it("decodes a data URL", async () => {
    const data = await readFile(SMALL_MP4);
    const dataUrl = `data:video/mp4;base64,${data.toString("base64")}`;
    const result = await resolveVideoToPath(dataUrl);
    try {
      expect(result.mimeType).toBe("video/mp4");
    } finally {
      await result.cleanup();
    }
  });

  it("rejects data URLs with unsupported MIME types", async () => {
    await expect(resolveVideoToPath("data:video/avi;base64,AAAA")).rejects.toThrow(
      VisualAIVideoError,
    );
  });
});

describe("probeDurationSeconds", () => {
  it("reports the duration of a 2 s video within tolerance", async () => {
    const duration = await probeDurationSeconds(SMALL_MP4);
    expect(duration).toBeGreaterThan(1.5);
    expect(duration).toBeLessThan(2.5);
  });

  it("throws VisualAIVideoError on a path that isn't a video", async () => {
    await expect(probeDurationSeconds(join(FIXTURES_DIR, "small.png"))).rejects.toThrow(
      VisualAIVideoError,
    );
  });
});

describe("extractFrames", () => {
  it("samples 2 frames at 1 fps from a 2 s clip with default options", async () => {
    const { frames, durationSeconds } = await extractFrames(SMALL_MP4);
    expect(durationSeconds).toBeGreaterThan(1.5);
    expect(durationSeconds).toBeLessThan(2.5);
    expect(frames).toHaveLength(2);
    expect(frames[0]?.mimeType).toBe("image/jpeg");
    expect(frames[0]?.index).toBe(0);
    expect(frames[1]?.index).toBe(1);
    // Centered timestamps: 0.5s and 1.5s
    expect(frames[0]!.timestampSeconds).toBeCloseTo(0.5, 5);
    expect(frames[1]!.timestampSeconds).toBeCloseTo(1.5, 5);
  });

  it("respects a maxFrames cap", async () => {
    const { frames } = await extractFrames(SMALL_MP4, { fps: 5, maxFrames: 1 });
    expect(frames).toHaveLength(1);
  });

  it("supports a higher fps", async () => {
    const { frames } = await extractFrames(SMALL_MP4, { fps: 2, maxFrames: 4 });
    expect(frames.length).toBeGreaterThanOrEqual(3);
    expect(frames.length).toBeLessThanOrEqual(4);
  });

  it("throws when the video exceeds the configured duration cap", async () => {
    await expect(extractFrames(OVERSIZED_MP4)).rejects.toThrow(/exceeds limit/);
  });

  it("allows raising the duration cap", async () => {
    const { frames, durationSeconds } = await extractFrames(OVERSIZED_MP4, {
      maxDurationSeconds: 30,
      maxFrames: 4,
      fps: 1,
    });
    expect(durationSeconds).toBeGreaterThan(10);
    expect(frames).toHaveLength(4);
  });

  it("rejects non-positive option values", async () => {
    await expect(extractFrames(SMALL_MP4, { fps: 0 })).rejects.toThrow(VisualAIVideoError);
    await expect(extractFrames(SMALL_MP4, { maxFrames: 0 })).rejects.toThrow(VisualAIVideoError);
    await expect(extractFrames(SMALL_MP4, { maxDurationSeconds: -1 })).rejects.toThrow(
      VisualAIVideoError,
    );
  });

  it("rejects NaN and Infinity option values", async () => {
    await expect(extractFrames(SMALL_MP4, { fps: NaN })).rejects.toThrow(VisualAIVideoError);
    await expect(extractFrames(SMALL_MP4, { fps: Infinity })).rejects.toThrow(VisualAIVideoError);
    await expect(extractFrames(SMALL_MP4, { maxFrames: NaN })).rejects.toThrow(VisualAIVideoError);
    await expect(extractFrames(SMALL_MP4, { maxDurationSeconds: NaN })).rejects.toThrow(
      VisualAIVideoError,
    );
  });

  it("rejects maxFrames above the hard cap of 60", async () => {
    await expect(extractFrames(SMALL_MP4, { maxFrames: 61 })).rejects.toThrow(
      /exceeds the hard cap/,
    );
  });

  describe("when ffprobe cannot determine duration", () => {
    let stubPath: string;

    beforeEach(async () => {
      stubPath = join(tmpdir(), `visual-ai-empty-${Date.now()}.mp4`);
      await writeFile(stubPath, Buffer.from([0, 0, 0, 0]));
    });

    afterEach(async () => {
      await rm(stubPath, { force: true });
    });

    it("throws VisualAIVideoError", async () => {
      await expect(extractFrames(stubPath)).rejects.toThrow(VisualAIVideoError);
    });
  });
});
