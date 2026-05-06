import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Frame } from "../types.js";

export const DEBUG_FRAMES_ENV = "VISUAL_AI_DEBUG_FRAMES";
export const DEBUG_FRAMES_DIR_ENV = "VISUAL_AI_DEBUG_FRAMES_DIR";
const DEFAULT_DIR_NAME = "visual-ai-debug-frames";

function isEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env[DEBUG_FRAMES_ENV];
  if (raw === undefined || raw === "") return false;
  const lower = raw.toLowerCase();
  return lower === "true" || lower === "1";
}

function timestampSlug(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function paddedIndex(value: number, total: number): string {
  const width = Math.max(2, String(total - 1).length);
  return String(value).padStart(width, "0");
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

/**
 * When `VISUAL_AI_DEBUG_FRAMES=true|1`, persist sampled video frames to disk
 * for offline inspection. Frames are written to a per-call subdirectory under
 * `VISUAL_AI_DEBUG_FRAMES_DIR` (or `./visual-ai-debug-frames` if unset).
 *
 * Best-effort: any failure is logged to stderr and swallowed so debug-only
 * disk problems never break the actual provider call.
 */
export async function saveDebugFrames(
  frames: readonly Frame[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  if (!isEnabled(env)) return undefined;
  if (frames.length === 0) return undefined;

  const baseDir = env[DEBUG_FRAMES_DIR_ENV]?.trim() || DEFAULT_DIR_NAME;
  const runDir = resolve(baseDir, `${timestampSlug(new Date())}-${randomBytes(3).toString("hex")}`);

  try {
    await mkdir(runDir, { recursive: true });
    await Promise.all(
      frames.map((frame) => {
        const idx = paddedIndex(frame.index, frames.length);
        const ts = frame.timestampSeconds.toFixed(2);
        const ext = extensionFromMimeType(frame.mimeType);
        const filename = `frame-${idx}-t${ts}s${ext}`;
        return writeFile(join(runDir, filename), frame.data);
      }),
    );
  } catch (err) {
    process.stderr.write(
      `[visual-ai-assertions] warning: failed to save debug frames to ${runDir}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return undefined;
  }

  process.stderr.write(
    `[visual-ai-assertions] Saved ${frames.length} debug frame(s) to ${runDir}\n`,
  );
  return runDir;
}
