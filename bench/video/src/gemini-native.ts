import { readFile } from "node:fs/promises";
import {
  FileState,
  FinishReason,
  GoogleGenAI,
  MediaResolution,
  ThinkingLevel,
  createPartFromUri,
  type File as GeminiFile,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
import type { ReasoningEffortLevel } from "../../../src/constants.js";
import type { NativeResolution } from "../video.config.js";
import { bugReportJsonSchema } from "./schema.js";
import type { VideoUsage } from "./types.js";

/**
 * Native delivery: the actual video bytes go to Gemini, which samples and
 * tokenises them server-side (`videoMetadata.fps` controls the sampling rate,
 * `mediaResolution` the tokens per frame, and the audio track is understood
 * too). This is the capability under test; frame sampling in `frames.ts` is the
 * comparison baseline.
 */
export interface NativeCallOptions {
  readonly model: string;
  readonly videoPath: string;
  readonly mimeType: string;
  readonly fps: number;
  readonly resolution: NativeResolution;
  readonly reasoningEffort: ReasoningEffortLevel;
  readonly maxTokens: number;
  readonly inlineLimitBytes: number;
  /** Full prompt including the output-schema section. */
  readonly prompt: string;
  readonly log?: (message: string) => void;
}

export interface NativeCallResult {
  readonly text: string;
  readonly usage: VideoUsage | undefined;
  readonly delivery: "inline" | "file";
  readonly finishReason: string | undefined;
}

const THINKING_LEVEL: Record<ReasoningEffortLevel, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
  xhigh: ThinkingLevel.HIGH,
};

const MEDIA_RESOLUTION: Record<Exclude<NativeResolution, "default">, MediaResolution> = {
  low: MediaResolution.MEDIA_RESOLUTION_LOW,
  medium: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
  high: MediaResolution.MEDIA_RESOLUTION_HIGH,
};

const FILE_POLL_INTERVAL_MS = 2000;
const FILE_POLL_TIMEOUT_MS = 5 * 60_000;

function requireApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is not set (put it in .env).");
  return key;
}

async function waitUntilActive(
  client: GoogleGenAI,
  file: GeminiFile,
  log: (message: string) => void,
): Promise<GeminiFile> {
  const name = file.name;
  if (!name) throw new Error("Gemini Files API returned a file without a name.");
  const deadline = Date.now() + FILE_POLL_TIMEOUT_MS;
  let current = file;
  while (current.state === FileState.PROCESSING) {
    if (Date.now() > deadline) {
      throw new Error(`Gemini file ${name} still PROCESSING after ${FILE_POLL_TIMEOUT_MS} ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
    current = await client.files.get({ name });
    log(`  file ${name}: ${current.state ?? "unknown"}`);
  }
  if (current.state !== FileState.ACTIVE) {
    throw new Error(
      `Gemini file ${name} ended in state ${current.state ?? "unknown"}: ${current.error?.message ?? "no error message"}`,
    );
  }
  return current;
}

function toUsage(response: GenerateContentResponse): VideoUsage | undefined {
  const um = response.usageMetadata;
  if (!um) return undefined;
  const thoughts = um.thoughtsTokenCount ?? 0;
  const byModality: Record<string, number> = {};
  for (const entry of um.promptTokensDetails ?? []) {
    if (entry.modality && typeof entry.tokenCount === "number") {
      byModality[entry.modality] = (byModality[entry.modality] ?? 0) + entry.tokenCount;
    }
  }
  return {
    inputTokens: um.promptTokenCount ?? 0,
    // Thinking is billed at the output rate, so fold it in (matches the library driver).
    outputTokens: (um.candidatesTokenCount ?? 0) + thoughts,
    ...(um.thoughtsTokenCount !== undefined && { reasoningTokens: um.thoughtsTokenCount }),
    ...(Object.keys(byModality).length > 0 && { inputTokensByModality: byModality }),
  };
}

export async function runNativeCall(options: NativeCallOptions): Promise<NativeCallResult> {
  const log = options.log ?? (() => undefined);
  const client = new GoogleGenAI({ apiKey: requireApiKey() });
  const bytes = await readFile(options.videoPath);

  let videoPart: Part;
  let delivery: "inline" | "file";
  let uploadedName: string | undefined;

  if (bytes.byteLength <= options.inlineLimitBytes) {
    delivery = "inline";
    videoPart = {
      inlineData: { data: bytes.toString("base64"), mimeType: options.mimeType },
      videoMetadata: { fps: options.fps },
    };
  } else {
    delivery = "file";
    log(`  uploading ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB via the Files API...`);
    const uploaded = await client.files.upload({
      file: options.videoPath,
      config: { mimeType: options.mimeType },
    });
    uploadedName = uploaded.name;
    const active = await waitUntilActive(client, uploaded, log);
    if (!active.uri) throw new Error("Gemini Files API returned an ACTIVE file without a URI.");
    videoPart = {
      ...createPartFromUri(active.uri, active.mimeType ?? options.mimeType),
      videoMetadata: { fps: options.fps },
    };
  }

  try {
    const response = await client.models.generateContent({
      model: options.model,
      contents: [{ role: "user", parts: [videoPart, { text: options.prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: bugReportJsonSchema(),
        maxOutputTokens: options.maxTokens,
        thinkingConfig: { thinkingLevel: THINKING_LEVEL[options.reasoningEffort] },
        ...(options.resolution !== "default" && {
          mediaResolution: MEDIA_RESOLUTION[options.resolution],
        }),
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    const text = response.text ?? "";
    if (finishReason === FinishReason.MAX_TOKENS) {
      throw new Error(
        `Gemini returned finishReason MAX_TOKENS: output budget of ${options.maxTokens} exhausted (thinking shares it). Raise --max-tokens or lower --effort. Partial text:\n${text.slice(0, 500)}`,
      );
    }
    if (finishReason && finishReason !== FinishReason.STOP) {
      throw new Error(`Gemini returned finishReason ${finishReason}. Text:\n${text.slice(0, 500)}`);
    }
    return { text, usage: toUsage(response), delivery, finishReason };
  } finally {
    if (uploadedName) {
      // Files expire after 48 h anyway; deleting is tidiness, not correctness.
      await client.files.delete({ name: uploadedName }).catch((error: unknown) => {
        log(`  (could not delete ${uploadedName}: ${String(error)})`);
      });
    }
  }
}
