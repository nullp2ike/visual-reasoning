import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { VisualAIVideoError } from "../errors.js";
import type { Frame, SupportedVideoMimeType, VideoSamplingOptions } from "../types.js";
import { decodeBase64, isDataUrl, isFilePath, parseDataUrl } from "./input-detect.js";

const FRAME_MAX_DIMENSION = 1568;
/** Default frame-sampling rate, shared by video sampling and pre-sampled frame inputs. */
export const DEFAULT_FPS = 1;
const DEFAULT_MAX_FRAMES = 10;
const DEFAULT_MAX_DURATION_SECONDS = 10;
/** Hard upper bound on caller-supplied frame counts to keep memory bounded. */
export const MAX_FRAMES_HARD_CAP = 60;
const FFPROBE_TIMEOUT_MS = 15_000;
const FFMPEG_RUN_TIMEOUT_MS = 60_000;

const VIDEO_EXTENSIONS: Record<string, SupportedVideoMimeType> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".qt": "video/quicktime",
  ".mkv": "video/x-matroska",
};

const VIDEO_MIME_TYPES: ReadonlySet<SupportedVideoMimeType> = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

export function isSupportedVideoMimeType(value: string): value is SupportedVideoMimeType {
  return VIDEO_MIME_TYPES.has(value as SupportedVideoMimeType);
}

export function getVideoMimeFromExtension(filePath: string): SupportedVideoMimeType | undefined {
  const ext = extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS[ext];
}

/**
 * Detects supported video MIME types from the leading bytes of a buffer.
 * Returns `null` if no signature matches.
 */
export function detectVideoMimeType(data: Buffer): SupportedVideoMimeType | null {
  if (data.length < 12) return null;

  // ISO BMFF: bytes 4..7 == "ftyp"
  if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
    // Brand "qt  " distinguishes QuickTime from MP4 family.
    if (data[8] === 0x71 && data[9] === 0x74 && data[10] === 0x20 && data[11] === 0x20) {
      return "video/quicktime";
    }
    return "video/mp4";
  }

  // EBML header (Matroska / WebM): 0x1A 0x45 0xDF 0xA3
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) {
    return "video/webm";
  }

  return null;
}

/**
 * Resolves a video `MediaInput` to an on-disk path that ffmpeg can read.
 * Accepts file paths, data URLs, base64 strings, Buffer, and Uint8Array.
 * URLs are not supported for video inputs — fetch the bytes yourself first.
 */
export async function resolveVideoToPath(
  input: Buffer | Uint8Array | string,
): Promise<{ path: string; mimeType: SupportedVideoMimeType; cleanup: () => Promise<void> }> {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const mimeType = detectVideoMimeType(buf);
    if (!mimeType) {
      throw new VisualAIVideoError("Unable to detect video format from buffer contents");
    }
    return writeBufferToTemp(buf, mimeType);
  }

  if (typeof input !== "string") {
    throw new VisualAIVideoError(
      "Invalid video input: expected Buffer, Uint8Array, file path, data URL, or base64 string",
    );
  }

  if (isDataUrl(input)) {
    const parsed = parseDataUrl(input);
    if (!parsed) {
      throw new VisualAIVideoError("Invalid data URL format");
    }
    if (!isSupportedVideoMimeType(parsed.mimeType)) {
      throw new VisualAIVideoError(`Unsupported video format: ${parsed.mimeType}`);
    }
    let buf: Buffer;
    try {
      buf = decodeBase64(parsed.base64Payload);
    } catch {
      throw new VisualAIVideoError("Invalid base64 payload in data URL");
    }
    return writeBufferToTemp(buf, parsed.mimeType);
  }

  if (isFilePath(input)) {
    const mimeType = getVideoMimeFromExtension(input);
    if (!mimeType) {
      throw new VisualAIVideoError(
        `Unsupported video file extension: ${input}. Supported: .mp4, .webm, .mov, .mkv`,
      );
    }
    return { path: input, mimeType, cleanup: async () => {} };
  }

  // Treat as raw base64 of a video.
  let buf: Buffer;
  try {
    buf = decodeBase64(input);
  } catch {
    throw new VisualAIVideoError(
      `Unrecognized video input: "${input.slice(0, 80)}". ` +
        `Expected a file path, data URL, or base64-encoded video string.`,
    );
  }
  const mimeType = detectVideoMimeType(buf);
  if (!mimeType) {
    throw new VisualAIVideoError(
      `Unrecognized video input: "${input.slice(0, 80)}". ` +
        `Expected a file path, data URL, or base64-encoded video string.`,
    );
  }
  return writeBufferToTemp(buf, mimeType);
}

async function writeBufferToTemp(
  data: Buffer,
  mimeType: SupportedVideoMimeType,
): Promise<{ path: string; mimeType: SupportedVideoMimeType; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "visual-ai-video-"));
  try {
    const ext = extensionFor(mimeType);
    const path = join(dir, `input${ext}`);
    await writeFile(path, data);
    return {
      path,
      mimeType,
      cleanup: async () => {
        try {
          await rm(dir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup; never mask the caller's flow.
        }
      },
    };
  } catch (err) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of the partially-staged dir.
    }
    throw err;
  }
}

function extensionFor(mimeType: SupportedVideoMimeType): string {
  switch (mimeType) {
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    case "video/x-matroska":
      return ".mkv";
  }
}

// --- ffmpeg integration ---

interface FfprobeData {
  format?: { duration?: number | string };
}

interface FfmpegCommand {
  outputOptions(options: string[]): FfmpegCommand;
  output(target: string): FfmpegCommand;
  on(event: "end", listener: () => void): FfmpegCommand;
  on(event: "error", listener: (err: Error) => void): FfmpegCommand;
  run(): void;
  kill(signal?: string): void;
}

interface FfmpegFactory {
  (input: string): FfmpegCommand;
  setFfmpegPath(path: string): void;
  setFfprobePath(path: string): void;
  ffprobe(path: string, callback: (err: Error | null, data: FfprobeData) => void): void;
}

let cachedFactoryPromise: Promise<FfmpegFactory> | undefined;

async function loadFfmpegFactory(): Promise<FfmpegFactory> {
  if (cachedFactoryPromise) return cachedFactoryPromise;

  cachedFactoryPromise = (async (): Promise<FfmpegFactory> => {
    let ffmpegModule: unknown;
    try {
      ffmpegModule = await import("fluent-ffmpeg");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
        throw new VisualAIVideoError(
          "Could not load fluent-ffmpeg. It ships as a dependency of visual-ai-assertions, " +
            "so this usually means the install was pruned or the platform-specific binary is unavailable. " +
            "Reinstall the package or run: pnpm add fluent-ffmpeg @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe",
        );
      }
      throw new VisualAIVideoError(
        `Failed to load fluent-ffmpeg: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const factory = ((ffmpegModule as { default?: unknown }).default ??
      ffmpegModule) as FfmpegFactory;

    try {
      const installer = (await import("@ffmpeg-installer/ffmpeg")) as unknown;
      const path = (
        (installer as { default?: { path?: string } }).default ?? (installer as { path?: string })
      ).path;
      if (path) factory.setFfmpegPath(path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") {
        process.stderr.write(
          `[visual-ai-assertions] warning: @ffmpeg-installer/ffmpeg failed to load: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }

    try {
      const installer = (await import("@ffprobe-installer/ffprobe")) as unknown;
      const path = (
        (installer as { default?: { path?: string } }).default ?? (installer as { path?: string })
      ).path;
      if (path) factory.setFfprobePath(path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") {
        process.stderr.write(
          `[visual-ai-assertions] warning: @ffprobe-installer/ffprobe failed to load: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }

    return factory;
  })();

  try {
    return await cachedFactoryPromise;
  } catch (err) {
    cachedFactoryPromise = undefined;
    throw err;
  }
}

/**
 * Probes a video file's duration in seconds. Throws `VisualAIVideoError` if
 * ffprobe is unavailable, the output is unparseable, or the call exceeds the
 * 15-second wall-clock timeout.
 */
export async function probeDurationSeconds(videoPath: string): Promise<number> {
  const ffmpeg = await loadFfmpegFactory();
  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => {
        reject(
          new VisualAIVideoError(
            `ffprobe timed out after ${FFPROBE_TIMEOUT_MS}ms while probing ${videoPath}`,
          ),
        );
      });
    }, FFPROBE_TIMEOUT_MS);
    ffmpeg.ffprobe(videoPath, (err, data) => {
      if (err) {
        finish(() => {
          reject(
            new VisualAIVideoError(
              `Failed to probe video metadata: ${err.message}. ` +
                `Ensure ffprobe is installed (e.g. via @ffprobe-installer/ffprobe).`,
            ),
          );
        });
        return;
      }
      const raw = data.format?.duration;
      const duration = typeof raw === "string" ? Number(raw) : raw;
      if (!duration || !Number.isFinite(duration) || duration <= 0) {
        finish(() => {
          reject(new VisualAIVideoError("Video duration could not be determined"));
        });
        return;
      }
      finish(() => {
        resolve(duration);
      });
    });
  });
}

/**
 * Samples frames from a video and returns them as `Frame` objects ready to
 * pass into a provider driver. Frames are extracted as JPEG, downscaled so
 * the longer edge fits within `FRAME_MAX_DIMENSION`, and time-stamped at
 * the centre of each sample window.
 */
export async function extractFrames(
  videoPath: string,
  options: VideoSamplingOptions = {},
): Promise<{ frames: Frame[]; durationSeconds: number }> {
  const fps = options.fps ?? DEFAULT_FPS;
  const maxFrames = options.maxFrames ?? DEFAULT_MAX_FRAMES;
  const maxDurationSeconds = options.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;

  if (!Number.isFinite(fps) || fps <= 0) {
    throw new VisualAIVideoError(`Invalid fps: ${fps}. Must be a finite number > 0.`);
  }
  if (!Number.isFinite(maxFrames) || maxFrames <= 0) {
    throw new VisualAIVideoError(`Invalid maxFrames: ${maxFrames}. Must be a finite number > 0.`);
  }
  if (maxFrames > MAX_FRAMES_HARD_CAP) {
    throw new VisualAIVideoError(
      `maxFrames ${maxFrames} exceeds the hard cap of ${MAX_FRAMES_HARD_CAP}. ` +
        `Lower maxFrames or open an issue if you need a larger limit.`,
    );
  }
  if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0) {
    throw new VisualAIVideoError(
      `Invalid maxDurationSeconds: ${maxDurationSeconds}. Must be a finite number > 0.`,
    );
  }

  const ffmpeg = await loadFfmpegFactory();
  const durationSeconds = await probeDurationSeconds(videoPath);

  if (durationSeconds > maxDurationSeconds) {
    throw new VisualAIVideoError(
      `Video duration ${durationSeconds.toFixed(2)}s exceeds limit of ${maxDurationSeconds}s. ` +
        `Pass { maxDurationSeconds: N } to override, or trim the source video.`,
    );
  }

  const outputDir = await mkdtemp(join(tmpdir(), "visual-ai-frames-"));
  try {
    // Constrain the longer edge to FRAME_MAX_DIMENSION for both portrait and landscape inputs.
    const filter =
      `fps=${fps},` +
      `scale='if(gt(iw,ih),min(${FRAME_MAX_DIMENSION},iw),-2)':` +
      `'if(gt(iw,ih),-2,min(${FRAME_MAX_DIMENSION},ih))':flags=area`;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cmd = ffmpeg(videoPath);
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        try {
          cmd.kill("SIGKILL");
        } catch {
          // Killing may fail if the child already exited; that's fine.
        }
        finish(() => {
          reject(
            new VisualAIVideoError(
              `ffmpeg frame extraction timed out after ${FFMPEG_RUN_TIMEOUT_MS}ms`,
            ),
          );
        });
      }, FFMPEG_RUN_TIMEOUT_MS);
      cmd
        .outputOptions(["-vf", filter, "-vframes", String(maxFrames), "-q:v", "3"])
        .output(join(outputDir, "frame-%04d.jpg"))
        .on("end", () => {
          finish(() => {
            resolve();
          });
        })
        .on("error", (err: Error) => {
          finish(() => {
            reject(new VisualAIVideoError(`ffmpeg frame extraction failed: ${err.message}`));
          });
        })
        .run();
    });

    const files = (await readdir(outputDir)).filter((name) => name.endsWith(".jpg")).sort();

    if (files.length === 0) {
      throw new VisualAIVideoError(
        "No frames could be extracted from the video. The source may be corrupt or empty.",
      );
    }

    const frames: Frame[] = await Promise.all(
      files.map(async (name, index): Promise<Frame> => {
        const data = await readFile(join(outputDir, name));
        const timestampSeconds = Math.min(durationSeconds, (index + 0.5) / fps);
        let cachedBase64: string | undefined;
        return {
          data,
          mimeType: "image/jpeg",
          get base64(): string {
            if (cachedBase64 === undefined) {
              cachedBase64 = data.toString("base64");
            }
            return cachedBase64;
          },
          timestampSeconds,
          index,
        };
      }),
    );

    return { frames, durationSeconds };
  } finally {
    try {
      await rm(outputDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; never mask the original control flow.
    }
  }
}
