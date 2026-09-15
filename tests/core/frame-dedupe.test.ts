import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  DEFAULT_DEDUPE_THRESHOLD,
  dedupeFrames,
  frameSignature,
  resolveDedupeOptions,
} from "../../src/core/frame-dedupe.js";
import { VisualAIVideoError } from "../../src/errors.js";
import type { Frame } from "../../src/types.js";

const WIDTH = 320;
const HEIGHT = 180;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  gray: number;
}

/** Solid gray PNG (RGBA, like the client tests) with optional rectangles composited on top. */
async function image(gray: number, rects: Rect[] = [], size = { width: WIDTH, height: HEIGHT }) {
  const overlays = await Promise.all(
    rects.map(async (r) => ({
      input: await sharp({
        create: {
          width: r.width,
          height: r.height,
          channels: 4,
          background: { r: r.gray, g: r.gray, b: r.gray, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
      left: r.left,
      top: r.top,
    })),
  );
  return sharp({
    create: {
      width: size.width,
      height: size.height,
      channels: 4,
      background: { r: gray, g: gray, b: gray, alpha: 1 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}

function makeFrame(data: Buffer, index: number, timestampSeconds = index): Frame {
  let base64Reads = 0;
  return {
    data,
    mimeType: "image/png",
    get base64(): string {
      base64Reads++;
      return data.toString("base64");
    },
    timestampSeconds,
    index,
    // Exposed for the laziness assertion below.
    get _base64Reads(): number {
      return base64Reads;
    },
  } as Frame;
}

// A toast-sized change: 60x12 on 320x180 is ~1.25% of the frame area.
const TOAST: Rect = { left: 200, top: 150, width: 60, height: 12, gray: 20 };
// A caret-sized flicker: 2x8 on 320x180 is ~0.03% of the frame area.
const CARET: Rect = { left: 40, top: 40, width: 2, height: 8, gray: 0 };

describe("resolveDedupeOptions", () => {
  it("defaults to enabled with the default threshold", () => {
    expect(resolveDedupeOptions(undefined)).toEqual({
      enabled: true,
      threshold: DEFAULT_DEDUPE_THRESHOLD,
    });
    expect(resolveDedupeOptions(true)).toEqual({
      enabled: true,
      threshold: DEFAULT_DEDUPE_THRESHOLD,
    });
    expect(resolveDedupeOptions({})).toEqual({
      enabled: true,
      threshold: DEFAULT_DEDUPE_THRESHOLD,
    });
  });

  it("disables with false", () => {
    expect(resolveDedupeOptions(false).enabled).toBe(false);
  });

  it("accepts a custom threshold in (0, 1]", () => {
    expect(resolveDedupeOptions({ threshold: 0.05 })).toEqual({ enabled: true, threshold: 0.05 });
    expect(resolveDedupeOptions({ threshold: 1 })).toEqual({ enabled: true, threshold: 1 });
  });

  it.each([0, -1, 2, Number.NaN, Number.POSITIVE_INFINITY])("rejects threshold %s", (threshold) => {
    expect(() => resolveDedupeOptions({ threshold })).toThrow(VisualAIVideoError);
    expect(() => resolveDedupeOptions({ threshold })).toThrow(/Invalid dedupe threshold/);
  });
});

describe("frameSignature", () => {
  it("produces a single-channel thumbnail no larger than 256 px on the longer edge", async () => {
    const sig = await frameSignature(makeFrame(await image(128), 0));
    expect(sig.width).toBe(256);
    expect(sig.height).toBe(144);
    expect(sig.pixels.length).toBe(sig.width * sig.height);
  });

  it("does not enlarge small frames", async () => {
    const sig = await frameSignature(makeFrame(await image(128, [], { width: 64, height: 32 }), 0));
    expect(sig.width).toBe(64);
    expect(sig.height).toBe(32);
  });

  it("throws VisualAIVideoError for an undecodable frame", async () => {
    const bad = makeFrame(Buffer.from([0xff, 0xd8, 0xff, 0x10]), 3, 3.5);
    await expect(frameSignature(bad)).rejects.toThrow(VisualAIVideoError);
    await expect(frameSignature(bad)).rejects.toThrow(/frame 3 \(3\.50s\)/);
  });
});

describe("dedupeFrames", () => {
  it("collapses identical frames to the first one", async () => {
    const a = await image(200);
    const frames = [makeFrame(a, 0), makeFrame(a, 1), makeFrame(a, 2), makeFrame(a, 3)];
    const result = await dedupeFrames(frames, undefined);
    expect(result.frames).toHaveLength(1);
    expect(result.dropped).toBe(3);
    expect(result.frames[0]).toBe(frames[0]);
  });

  it("keeps a frame where a toast-sized region changed", async () => {
    const frames = [makeFrame(await image(200), 0), makeFrame(await image(200, [TOAST]), 1)];
    const result = await dedupeFrames(frames, undefined);
    expect(result.frames).toHaveLength(2);
    expect(result.dropped).toBe(0);
  });

  it("drops a frame whose only change is a caret-sized flicker", async () => {
    const frames = [makeFrame(await image(200), 0), makeFrame(await image(200, [CARET]), 1)];
    const result = await dedupeFrames(frames, undefined);
    expect(result.frames).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it("drops a frame that differs only by sub-tolerance compression noise", async () => {
    const frames = [makeFrame(await image(200), 0), makeFrame(await image(208), 1)];
    const result = await dedupeFrames(frames, undefined);
    expect(result.frames).toHaveLength(1);
  });

  it("compares against the last kept frame so gradual drift accumulates", async () => {
    // Each step is below the per-pixel tolerance relative to its predecessor,
    // but the third step is well past it relative to the last kept frame.
    const frames = [
      makeFrame(await image(100), 0),
      makeFrame(await image(112), 1),
      makeFrame(await image(124), 2),
      makeFrame(await image(136), 3),
      makeFrame(await image(148), 4),
    ];
    const result = await dedupeFrames(frames, undefined);
    expect(result.frames.map((f) => f.timestampSeconds)).toEqual([0, 3]);
    expect(result.dropped).toBe(3);
  });

  it("always keeps the first frame and does not force-keep the last", async () => {
    const a = await image(200);
    const b = await image(200, [TOAST]);
    const frames = [makeFrame(a, 0), makeFrame(b, 1), makeFrame(b, 2)];
    const result = await dedupeFrames(frames, undefined);
    expect(result.frames.map((f) => f.timestampSeconds)).toEqual([0, 1]);
    expect(result.dropped).toBe(1);
  });

  it("re-assigns contiguous indices, keeps timestamps, and keeps base64 lazy", async () => {
    const a = await image(200);
    const b = await image(200, [TOAST]);
    const c = await image(60);
    const frames = [
      makeFrame(a, 0, 0.5),
      makeFrame(a, 1, 1.5),
      makeFrame(b, 2, 2.5),
      makeFrame(b, 3, 3.5),
      makeFrame(c, 4, 4.5),
    ];
    const result = await dedupeFrames(frames, undefined);
    expect(result.frames.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(result.frames.map((f) => f.timestampSeconds)).toEqual([0.5, 2.5, 4.5]);
    expect(result.frames.map((f) => f.data)).toEqual([a, b, c]);
    expect(result.frames.map((f) => f.mimeType)).toEqual(["image/png", "image/png", "image/png"]);

    // Dedupe must not have touched the base64 getters of the sources.
    const reads = frames.map((f) => (f as unknown as { _base64Reads: number })._base64Reads);
    expect(reads).toEqual([0, 0, 0, 0, 0]);
    expect(result.frames[1]!.base64).toBe(b.toString("base64"));
  });

  it("passes frames through untouched when disabled", async () => {
    const a = await image(200);
    const frames = [makeFrame(a, 0), makeFrame(a, 1)];
    const result = await dedupeFrames(frames, false);
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]).toBe(frames[0]);
    expect(result.frames[1]).toBe(frames[1]);
    expect(result.dropped).toBe(0);
  });

  it("does not decode a single frame", async () => {
    const only = makeFrame(Buffer.from([0xff, 0xd8, 0xff, 0x10]), 0);
    const result = await dedupeFrames([only], undefined);
    expect(result.frames).toEqual([only]);
    expect(result.dropped).toBe(0);
  });

  it("returns an empty list for no frames", async () => {
    const result = await dedupeFrames([], undefined);
    expect(result.frames).toEqual([]);
    expect(result.dropped).toBe(0);
  });

  it("honours a custom threshold in both directions", async () => {
    const base = makeFrame(await image(200), 0);
    const toast = makeFrame(await image(200, [TOAST]), 1);
    const caret = makeFrame(await image(200, [CARET]), 1);

    const strict = await dedupeFrames([base, toast], { threshold: 0.5 });
    expect(strict.frames).toHaveLength(1);

    const sensitive = await dedupeFrames([base, caret], { threshold: 0.0001 });
    expect(sensitive.frames).toHaveLength(2);
  });

  it("keeps a frame whose dimensions differ from the last kept frame", async () => {
    const frames = [
      makeFrame(await image(200), 0),
      makeFrame(await image(200, [], { width: 200, height: 200 }), 1),
    ];
    const result = await dedupeFrames(frames, undefined);
    expect(result.frames).toHaveLength(2);
  });

  it("rejects an invalid threshold before decoding anything", async () => {
    const bad = makeFrame(Buffer.from([0xff, 0xd8, 0xff, 0x10]), 0);
    await expect(dedupeFrames([bad, bad], { threshold: 0 })).rejects.toThrow(
      /Invalid dedupe threshold/,
    );
  });

  it("throws VisualAIVideoError when a frame cannot be decoded", async () => {
    const frames = [
      makeFrame(await image(200), 0),
      makeFrame(Buffer.from([0xff, 0xd8, 0xff, 0x10]), 1),
    ];
    await expect(dedupeFrames(frames, undefined)).rejects.toThrow(VisualAIVideoError);
  });
});
