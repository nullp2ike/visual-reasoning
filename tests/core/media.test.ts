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
