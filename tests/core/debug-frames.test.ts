import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEBUG_FRAMES_DIR_ENV,
  DEBUG_FRAMES_ENV,
  saveDebugFrames,
} from "../../src/core/debug-frames.js";
import type { Frame } from "../../src/types.js";

function buildFrame(index: number, timestampSeconds: number, byteValue = 0x10): Frame {
  const data = Buffer.from([0xff, 0xd8, 0xff, byteValue]);
  return {
    data,
    mimeType: "image/jpeg",
    base64: data.toString("base64"),
    timestampSeconds,
    index,
  };
}

describe("saveDebugFrames", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("returns undefined when the env flag is unset", async () => {
    const result = await saveDebugFrames([buildFrame(0, 0.5)], {});
    expect(result).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("returns undefined when the env flag is explicitly false", async () => {
    const result = await saveDebugFrames([buildFrame(0, 0.5)], {
      [DEBUG_FRAMES_ENV]: "false",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined and skips IO when given no frames", async () => {
    const result = await saveDebugFrames([], { [DEBUG_FRAMES_ENV]: "true" });
    expect(result).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("writes frames to a per-call subdirectory under the configured base dir", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "vis-ai-debug-"));
    try {
      const frames = [buildFrame(0, 0.5), buildFrame(1, 1.5, 0x11), buildFrame(2, 2.5, 0x12)];
      const dir = await saveDebugFrames(frames, {
        [DEBUG_FRAMES_ENV]: "1",
        [DEBUG_FRAMES_DIR_ENV]: baseDir,
      });

      expect(dir).toBeDefined();
      expect(dir!.startsWith(baseDir)).toBe(true);

      const files = (await readdir(dir!)).sort();
      expect(files).toHaveLength(3);
      expect(files[0]).toMatch(/^frame-00-t0\.50s\.jpg$/);
      expect(files[1]).toMatch(/^frame-01-t1\.50s\.jpg$/);
      expect(files[2]).toMatch(/^frame-02-t2\.50s\.jpg$/);

      const firstBytes = await readFile(join(dir!, files[0]));
      expect(firstBytes.equals(frames[0].data)).toBe(true);

      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(stderrText).toContain("Saved 3 debug frame(s)");
      expect(stderrText).toContain(dir!);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("uses extensions matching the frame mime type", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "vis-ai-debug-"));
    try {
      const pngFrame: Frame = { ...buildFrame(0, 0), mimeType: "image/png" };
      const dir = await saveDebugFrames([pngFrame], {
        [DEBUG_FRAMES_ENV]: "true",
        [DEBUG_FRAMES_DIR_ENV]: baseDir,
      });
      const files = await readdir(dir!);
      expect(files[0]).toMatch(/\.png$/);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("returns undefined and warns when disk write fails", async () => {
    const dir = await saveDebugFrames([buildFrame(0, 0)], {
      [DEBUG_FRAMES_ENV]: "true",
      [DEBUG_FRAMES_DIR_ENV]: "/dev/null/nope",
    });
    expect(dir).toBeUndefined();
    const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrText).toContain("failed to save debug frames");
  });
});
