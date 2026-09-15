import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isVideoInput, normalizeMedia } from "../../src/core/media.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

describe("isVideoInput", () => {
  it("returns true for an MP4 file path", () => {
    expect(isVideoInput("./clip.mp4")).toBe(true);
    expect(isVideoInput("/abs/path/clip.MP4")).toBe(true);
  });

  it("returns true for a WebM/MOV/MKV file path", () => {
    expect(isVideoInput("./clip.webm")).toBe(true);
    expect(isVideoInput("./clip.mov")).toBe(true);
    expect(isVideoInput("./clip.mkv")).toBe(true);
  });

  it("returns false for any URL — video URLs are not supported", () => {
    expect(isVideoInput("https://example.com/clip.mp4")).toBe(false);
    expect(isVideoInput("https://example.com/clip.mp4?v=1&t=2")).toBe(false);
    expect(isVideoInput("http://example.com/clip.webm")).toBe(false);
  });

  it("returns false for an image file path or URL", () => {
    expect(isVideoInput("./screenshot.png")).toBe(false);
    expect(isVideoInput("https://example.com/img.jpg")).toBe(false);
  });

  it("returns true for a video data URL", async () => {
    const data = await readFile(join(FIXTURES_DIR, "small.mp4"));
    const dataUrl = `data:video/mp4;base64,${data.toString("base64")}`;
    expect(isVideoInput(dataUrl)).toBe(true);
  });

  it("returns false for an image data URL", () => {
    expect(isVideoInput("data:image/png;base64,iVBORw0KGgo")).toBe(false);
  });

  it("detects video Buffers via magic bytes", async () => {
    const mp4 = await readFile(join(FIXTURES_DIR, "small.mp4"));
    const webm = await readFile(join(FIXTURES_DIR, "small.webm"));
    expect(isVideoInput(mp4)).toBe(true);
    expect(isVideoInput(webm)).toBe(true);
  });

  it("returns false for image Buffers", async () => {
    const png = await readFile(join(FIXTURES_DIR, "small.png"));
    expect(isVideoInput(png)).toBe(false);
  });

  it("detects raw base64 video payloads", async () => {
    const data = await readFile(join(FIXTURES_DIR, "small.webm"));
    const base64 = data.toString("base64");
    expect(isVideoInput(base64)).toBe(true);
  });

  it("returns false for raw base64 image payloads", async () => {
    const data = await readFile(join(FIXTURES_DIR, "small.png"));
    expect(isVideoInput(data.toString("base64"))).toBe(false);
  });
});

describe("normalizeMedia", () => {
  it("normalizes an image to { kind: 'image', image }", async () => {
    const png = await readFile(join(FIXTURES_DIR, "small.png"));
    const result = await normalizeMedia(png);
    expect(result.kind).toBe("image");
    if (result.kind !== "image") return;
    expect(result.image.mimeType).toBe("image/png");
  });

  it("normalizes a video to { kind: 'video', frames, durationSeconds }", async () => {
    const result = await normalizeMedia(join(FIXTURES_DIR, "small.mp4"));
    expect(result.kind).toBe("video");
    if (result.kind !== "video") return;
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.durationSeconds).toBeGreaterThan(0);
    for (const frame of result.frames) {
      expect(frame.mimeType).toBe("image/jpeg");
      expect(frame.timestampSeconds).toBeGreaterThanOrEqual(0);
    }
    // The fixture's two frames differ visibly, so nothing is dropped by default.
    expect(result.frames).toHaveLength(2);
    expect(result.droppedUnchanged).toBe(0);
  });

  it("keeps every frame with dedupe disabled and reports zero dropped", async () => {
    const result = await normalizeMedia(join(FIXTURES_DIR, "small.mp4"), { dedupe: false });
    if (result.kind !== "video") throw new Error("expected video result");
    expect(result.frames).toHaveLength(2);
    expect(result.droppedUnchanged).toBe(0);
  });

  it("drops the second frame when the dedupe threshold is raised past its change", async () => {
    const result = await normalizeMedia(join(FIXTURES_DIR, "small.mp4"), {
      dedupe: { threshold: 1 },
    });
    if (result.kind !== "video") throw new Error("expected video result");
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]?.timestampSeconds).toBe(0.5);
    expect(result.droppedUnchanged).toBe(1);
    expect(result.durationSeconds).toBeGreaterThan(1.5);
  });

  it("rejects an invalid dedupe threshold", async () => {
    await expect(
      normalizeMedia(join(FIXTURES_DIR, "small.mp4"), { dedupe: { threshold: 2 } }),
    ).rejects.toThrow(/Invalid dedupe threshold/);
  });

  it("forwards video sampling options", async () => {
    const result = await normalizeMedia(join(FIXTURES_DIR, "small.mp4"), {
      fps: 1,
      maxFrames: 1,
    });
    if (result.kind !== "video") {
      throw new Error("expected video result");
    }
    expect(result.frames).toHaveLength(1);
  });
});

describe("normalizeMedia with native video delivery", () => {
  const SMALL_MP4 = join(FIXTURES_DIR, "small.mp4");

  it("returns the video bytes, MIME type, probed duration, and fps without extracting frames", async () => {
    const result = await normalizeMedia(SMALL_MP4, undefined, undefined, true);
    expect(result.kind).toBe("native-video");
    if (result.kind !== "native-video") return;
    expect(result.video.data.equals(await readFile(SMALL_MP4))).toBe(true);
    expect(result.video.mimeType).toBe("video/mp4");
    expect(result.video.durationSeconds).toBeGreaterThan(1.5);
    expect(result.video.durationSeconds).toBeLessThan(2.5);
    expect(result.video.fps).toBe(1);
  });

  it("forwards fps and accepts a Buffer input", async () => {
    const bytes = await readFile(SMALL_MP4);
    const result = await normalizeMedia(bytes, { fps: 2 }, undefined, true);
    if (result.kind !== "native-video") throw new Error("expected native video");
    expect(result.video.fps).toBe(2);
    expect(result.video.mimeType).toBe("video/mp4");
    expect(result.video.data.equals(bytes)).toBe(true);
  });

  it("still enforces maxDurationSeconds before any provider call", async () => {
    await expect(
      normalizeMedia(SMALL_MP4, { maxDurationSeconds: 1 }, undefined, true),
    ).rejects.toThrow(/exceeds limit of 1s/);
  });

  it("still validates the numeric sampling options", async () => {
    await expect(normalizeMedia(SMALL_MP4, { fps: 0 }, undefined, true)).rejects.toThrow(
      /Invalid fps/,
    );
  });

  it("leaves images and pre-sampled frames on their usual paths", async () => {
    const png = await readFile(join(FIXTURES_DIR, "small.png"));
    const image = await normalizeMedia(png, undefined, undefined, true);
    expect(image.kind).toBe("image");
    const frames = await normalizeMedia({ frames: [png] }, undefined, undefined, true);
    expect(frames.kind).toBe("video");
  });
});
