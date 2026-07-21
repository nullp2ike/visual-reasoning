import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isFramesInput, normalizeFrames, normalizeMedia } from "../../src/core/media.js";
import { VisualAIVideoError } from "../../src/errors.js";

// Proof that the pre-sampled frames path never loads ffmpeg: this factory only
// runs if `fluent-ffmpeg` is actually imported. Every test below asserts the
// flag stays false.
const { ffmpeg } = vi.hoisted(() => ({ ffmpeg: { loaded: false } }));
vi.mock("fluent-ffmpeg", () => {
  ffmpeg.loaded = true;
  return { default: () => ({}) };
});

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

async function pngBuffer(): Promise<Buffer> {
  return readFile(join(FIXTURES_DIR, "small.png"));
}

describe("isFramesInput", () => {
  it("returns true for a { frames } object", () => {
    expect(isFramesInput({ frames: [] })).toBe(true);
    expect(isFramesInput({ frames: ["./a.png"], fps: 2 })).toBe(true);
  });

  it("returns false for MediaInput shapes", () => {
    expect(isFramesInput("./clip.mp4")).toBe(false);
    expect(isFramesInput(Buffer.from([1, 2, 3]))).toBe(false);
    expect(isFramesInput(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(isFramesInput(null)).toBe(false);
    expect(isFramesInput(undefined)).toBe(false);
    expect(isFramesInput({})).toBe(false);
  });
});

describe("normalizeFrames", () => {
  it("normalizes bare image frames with fps-derived timestamps", async () => {
    const png = await pngBuffer();
    const result = await normalizeFrames({ frames: [png, png, png] });

    expect(result.kind).toBe("video");
    if (result.kind !== "video") return;
    expect(result.frames).toHaveLength(3);
    expect(result.frames.map((f) => f.timestampSeconds)).toEqual([0, 1, 2]);
    expect(result.frames.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(result.durationSeconds).toBe(2);
    for (const frame of result.frames) {
      expect(frame.mimeType).toBe("image/png");
      expect(frame.base64.length).toBeGreaterThan(0);
    }
    expect(ffmpeg.loaded).toBe(false);
  });

  it("derives timestamps from a custom fps", async () => {
    const png = await pngBuffer();
    const result = await normalizeFrames({ frames: [png, png, png], fps: 2 });
    if (result.kind !== "video") throw new Error("expected video");
    expect(result.frames.map((f) => f.timestampSeconds)).toEqual([0, 0.5, 1]);
    expect(result.durationSeconds).toBe(1);
    expect(ffmpeg.loaded).toBe(false);
  });

  it("honors explicit per-frame timestamps and mixes shapes", async () => {
    const png = await pngBuffer();
    const result = await normalizeFrames({
      frames: [png, { image: png, timestampSeconds: 3.5 }, { image: png }],
      fps: 1,
    });
    if (result.kind !== "video") throw new Error("expected video");
    // Frame 0 bare → 0; frame 1 explicit → 3.5; frame 2 bare → index/fps = 2.
    expect(result.frames.map((f) => f.timestampSeconds)).toEqual([0, 3.5, 2]);
    expect(result.durationSeconds).toBe(3.5);
    expect(ffmpeg.loaded).toBe(false);
  });

  it("throws on an empty frames array", async () => {
    await expect(normalizeFrames({ frames: [] })).rejects.toThrow(VisualAIVideoError);
    expect(ffmpeg.loaded).toBe(false);
  });

  it("throws when the frame count exceeds the hard cap", async () => {
    const png = await pngBuffer();
    const frames = Array.from({ length: 61 }, () => png);
    await expect(normalizeFrames({ frames })).rejects.toThrow(/exceeds the hard cap of 60/);
    expect(ffmpeg.loaded).toBe(false);
  });

  it("throws on an invalid fps", async () => {
    const png = await pngBuffer();
    await expect(normalizeFrames({ frames: [png], fps: 0 })).rejects.toThrow(/Invalid fps/);
    await expect(normalizeFrames({ frames: [png], fps: -1 })).rejects.toThrow(/Invalid fps/);
    expect(ffmpeg.loaded).toBe(false);
  });

  it("throws on a negative explicit timestamp", async () => {
    const png = await pngBuffer();
    await expect(
      normalizeFrames({ frames: [{ image: png, timestampSeconds: -1 }] }),
    ).rejects.toThrow(/Invalid timestampSeconds/);
    expect(ffmpeg.loaded).toBe(false);
  });
});

describe("normalizeMedia dispatches FramesInput without loading ffmpeg", () => {
  it("routes a { frames } object through the frames path", async () => {
    const png = await pngBuffer();
    const result = await normalizeMedia({ frames: [png, png] });
    expect(result.kind).toBe("video");
    if (result.kind !== "video") return;
    expect(result.frames).toHaveLength(2);
    expect(ffmpeg.loaded).toBe(false);
  });
});
