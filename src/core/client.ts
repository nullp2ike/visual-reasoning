import { Model } from "../constants.js";
import { VisualAIConfigError } from "../errors.js";
import {
  buildAccessibilityPrompt,
  buildContentPrompt,
  buildElementsVisibilityPrompt,
  buildLayoutPrompt,
  buildPageLoadPrompt,
} from "../templates/index.js";
import type {
  AccessibilityOptions,
  AskOptions,
  AskResult,
  CheckOptions,
  CheckResult,
  CompareOptions,
  CompareResult,
  ContentOptions,
  ElementsVisibilityOptions,
  FramesInput,
  ImageInput,
  LayoutOptions,
  MediaInput,
  NativeVideoMetadata,
  NormalizedImage,
  NormalizedVideo,
  PageLoadOptions,
  ProviderName,
  VideoFramesMetadata,
  VideoSamplingOptions,
  VisualAIConfig,
} from "../types.js";
import { AnthropicDriver } from "../providers/anthropic.js";
import { GoogleDriver } from "../providers/google.js";
import { OpenAIDriver } from "../providers/openai.js";
import { OpenRouterDriver } from "../providers/openrouter.js";
import type {
  ProviderConfig,
  ProviderDriver,
  RawProviderResponse,
  SendMessageOptions,
} from "../providers/types.js";
import { resolveConfig } from "./config.js";
import {
  debugLog,
  processUsage,
  timedSendMessage,
  timedSendVideoMessage,
  withErrorDebug,
} from "./debug.js";
import { generateAiDiff } from "./diff.js";
import { normalizeImage } from "./image.js";
import { isFramesInput, isVideoInput, normalizeMedia, type NormalizedMedia } from "./media.js";
import {
  buildAskPrompt,
  buildCheckPrompt,
  buildComparePrompt,
  type MediaContext,
} from "./prompt.js";
import {
  AskResponseSchema,
  CheckResponseSchema,
  CompareResponseSchema,
  parseAskResponse,
  parseCheckResponse,
  parseCompareResponse,
} from "./response.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";

function toSchemaOptions(schema: z.ZodType): SendMessageOptions {
  return {
    responseSchema: zodToJsonSchema(schema, { target: "openAi" }) as Record<string, unknown>,
  };
}

/**
 * High-level client for running visual checks against screenshots or other images.
 *
 * @example
 * ```ts
 * const client = visualAI({ model: "gpt-5-mini" });
 * const result = await client.check("./tests/fixtures/small.png", "The button is visible");
 * ```
 */
export interface VisualAIClient {
  /**
   * Verifies one or more statements against a single image or video.
   *
   * Pass an image (PNG/JPEG/WebP/GIF) for a single-frame check. Pass a video
   * (MP4/WebM/MOV/MKV file path, base64, Buffer) and statements pass if they
   * are true at any point, with each statement result carrying the timestamp
   * where it matched. On providers that accept video natively (Google models)
   * the video itself is sent and the result's `video` metadata describes the
   * delivery; elsewhere the client samples frames with ffmpeg and the `frames`
   * metadata reports which timestamps the model saw. Control this with
   * `video.mode`. Pass a `FramesInput` (`{ frames, fps? }`) to supply
   * pre-sampled frames directly — handled identically to a sampled timeline but
   * without loading ffmpeg.
   *
   * @param input Image or video source as a buffer, URL, file path, or base64 string, or a `FramesInput` of pre-sampled frames.
   * @param statements One or more statements to validate against the input.
   * @param options Optional additional instructions and video sampling overrides.
   * @returns A structured result describing pass/fail, issues, and statement reasoning.
   * @throws {VisualAIConfigError} When no statements are provided.
   * @throws {VisualAIImageError} When an image input cannot be loaded or decoded.
   * @throws {VisualAIVideoError} When a video input cannot be loaded, exceeds the duration cap, or ffmpeg is missing.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * const result = await client.check(screenshot, [
   *   "The primary CTA is visible",
   *   "There is no error banner",
   * ]);
   * ```
   * @example
   * ```ts
   * const result = await client.check("./recording.webm", [
   *   'A success toast with text "Saved" briefly appears',
   * ]);
   * console.log(result.statements[0].timestampSeconds); // e.g. 3.5
   * ```
   */
  check(
    input: MediaInput | FramesInput,
    statements: string | string[],
    options?: CheckOptions,
  ): Promise<CheckResult>;
  /**
   * Asks an open-ended question about an image or video and returns a structured summary.
   *
   * Video inputs are analyzed as a chronological timeline. On providers that
   * accept video natively (Google models) the video itself is sent and the
   * result's `timestampReferences` array surfaces the moments the model relied
   * on; elsewhere frames are sampled with ffmpeg and `frameReferences` indexes
   * into `frames.timestampsSeconds`. Control this with `video.mode`. Pass a
   * `FramesInput` (`{ frames, fps? }`) to supply pre-sampled frames directly —
   * handled identically to a sampled timeline but without loading ffmpeg.
   *
   * @param input Image or video source as a buffer, URL, file path, or base64 string, or a `FramesInput` of pre-sampled frames.
   * @param prompt Prompt describing what to inspect in the input.
   * @param options Optional additional instructions and video sampling overrides.
   * @returns A summary with any detected issues.
   * @throws {VisualAIImageError} When an image input cannot be loaded or decoded.
   * @throws {VisualAIVideoError} When a video input cannot be loaded, exceeds the duration cap, or ffmpeg is missing.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * const result = await client.ask(screenshot, "What looks visually broken on this page?");
   * ```
   */
  ask(input: MediaInput | FramesInput, prompt: string, options?: AskOptions): Promise<AskResult>;
  /**
   * Compares two images and reports meaningful visual differences.
   *
   * @param imageA Baseline image source.
   * @param imageB Candidate image source.
   * @param options Optional comparison prompt, instructions, and diff-image settings.
   *   `gemini-3-flash-preview` generates an annotated diff image by default;
   *   pass `{ diffImage: false }` to opt out.
   * @returns A structured comparison result with optional diff image metadata.
   * @throws {VisualAIImageError} When either image cannot be loaded or decoded.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * const result = await client.compare(beforeScreenshot, afterScreenshot, {
   *   diffImage: true,
   * });
   * ```
   */
  compare(imageA: ImageInput, imageB: ImageInput, options?: CompareOptions): Promise<CompareResult>;
  /**
   * Checks that the listed elements are visible in an image. Image input only —
   * template helpers do not accept video input; use `check()` for video.
   *
   * @param image Image source as a buffer, URL, file path, or base64 string.
   * @param elements Element descriptions that should be present and visible.
   * @param options Optional additional instructions appended to the prompt.
   * @returns A structured pass/fail result for the requested elements.
   * @throws {VisualAIConfigError} When `elements` is empty.
   * @throws {VisualAIImageError} When the image cannot be loaded or decoded.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * await client.elementsVisible(screenshot, ["Save button", "Profile avatar"]);
   * ```
   */
  elementsVisible(
    image: ImageInput,
    elements: string[],
    options?: ElementsVisibilityOptions,
  ): Promise<CheckResult>;
  /**
   * Checks that the listed elements are not visible in an image. Image input
   * only — template helpers do not accept video input; use `check()` for video.
   *
   * @param image Image source as a buffer, URL, file path, or base64 string.
   * @param elements Element descriptions that should be absent or hidden.
   * @param options Optional additional instructions appended to the prompt.
   * @returns A structured pass/fail result for the requested elements.
   * @throws {VisualAIConfigError} When `elements` is empty.
   * @throws {VisualAIImageError} When the image cannot be loaded or decoded.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * await client.elementsHidden(screenshot, ["Cookie banner"]);
   * ```
   */
  elementsHidden(
    image: ImageInput,
    elements: string[],
    options?: ElementsVisibilityOptions,
  ): Promise<CheckResult>;
  /**
   * Runs the built-in accessibility template against an image. Image input
   * only — template helpers do not accept video input.
   *
   * @param image Image source as a buffer, URL, file path, or base64 string.
   * @param options Optional checks and extra instructions for the accessibility prompt.
   * @returns A structured accessibility-focused check result.
   * @throws {VisualAIImageError} When the image cannot be loaded or decoded.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * await client.accessibility(screenshot, { checks: ["contrast"] });
   * ```
   */
  accessibility(image: ImageInput, options?: AccessibilityOptions): Promise<CheckResult>;
  /**
   * Runs the built-in layout template against an image. Image input only —
   * template helpers do not accept video input.
   *
   * @param image Image source as a buffer, URL, file path, or base64 string.
   * @param options Optional checks and extra instructions for the layout prompt.
   * @returns A structured layout-focused check result.
   * @throws {VisualAIImageError} When the image cannot be loaded or decoded.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * await client.layout(screenshot, { checks: ["overflow", "alignment"] });
   * ```
   */
  layout(image: ImageInput, options?: LayoutOptions): Promise<CheckResult>;
  /**
   * Runs the built-in page-load template against an image. Image input only —
   * template helpers do not accept video input.
   *
   * @param image Image source as a buffer, URL, file path, or base64 string.
   * @param options Optional page-load expectations and extra instructions.
   * @returns A structured page-load check result.
   * @throws {VisualAIImageError} When the image cannot be loaded or decoded.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * await client.pageLoad(screenshot, { expectLoaded: true });
   * ```
   */
  pageLoad(image: ImageInput, options?: PageLoadOptions): Promise<CheckResult>;
  /**
   * Runs the built-in content template against an image. Image input only —
   * template helpers do not accept video input.
   *
   * @param image Image source as a buffer, URL, file path, or base64 string.
   * @param options Optional content checks and extra instructions.
   * @returns A structured content-focused check result.
   * @throws {VisualAIImageError} When the image cannot be loaded or decoded.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * await client.content(screenshot, { checks: ["placeholder-text"] });
   * ```
   */
  content(image: ImageInput, options?: ContentOptions): Promise<CheckResult>;
}

type ProviderFactory = (config: ProviderConfig) => ProviderDriver;

const PROVIDER_REGISTRY = {
  anthropic: (config) => new AnthropicDriver(config),
  openai: (config) => new OpenAIDriver(config),
  google: (config) => new GoogleDriver(config),
  openrouter: (config) => new OpenRouterDriver(config),
} as const satisfies Record<ProviderName, ProviderFactory>;

function createDriver(provider: ProviderName, config: ProviderConfig): ProviderDriver {
  return PROVIDER_REGISTRY[provider](config);
}

const checkSchemaOptions = toSchemaOptions(CheckResponseSchema);
const askSchemaOptions = toSchemaOptions(AskResponseSchema);
const compareSchemaOptions = toSchemaOptions(CompareResponseSchema);

/** Media-derived fields spread onto a `check()` / `ask()` result. */
interface MediaResultMetadata {
  frames?: VideoFramesMetadata;
  video?: NativeVideoMetadata;
}

type MediaDispatch =
  | {
      kind: "images";
      images: NormalizedImage[];
      mediaContext: MediaContext;
      frames: VideoFramesMetadata | undefined;
    }
  | { kind: "native-video"; video: NormalizedVideo; mediaContext: MediaContext };

function mediaToProviderInputs(media: NormalizedMedia): MediaDispatch {
  if (media.kind === "image") {
    return {
      kind: "images",
      images: [media.image],
      mediaContext: { kind: "image" },
      frames: undefined,
    };
  }
  if (media.kind === "native-video") {
    return {
      kind: "native-video",
      video: media.video,
      mediaContext: { kind: "native-video", durationSeconds: media.video.durationSeconds },
    };
  }
  const timestamps = media.frames.map((f) => f.timestampSeconds);
  return {
    kind: "images",
    images: media.frames,
    mediaContext: {
      kind: "video",
      frameTimestamps: timestamps,
      durationSeconds: media.durationSeconds,
      droppedUnchanged: media.droppedUnchanged,
    },
    frames: {
      count: media.frames.length,
      timestampsSeconds: timestamps,
      durationSeconds: media.durationSeconds,
      droppedUnchanged: media.droppedUnchanged,
    },
  };
}

/** Sends the dispatched media through the matching driver method and returns the metadata for the result. */
async function sendMedia(
  driver: ProviderDriver,
  dispatch: MediaDispatch,
  prompt: string,
  options: SendMessageOptions,
): Promise<{
  response: RawProviderResponse & { durationSeconds: number };
  metadata: MediaResultMetadata;
}> {
  if (dispatch.kind === "native-video") {
    const response = await timedSendVideoMessage(driver, dispatch.video, prompt, options);
    const { durationSeconds, fps, mimeType } = dispatch.video;
    return {
      response,
      metadata: { video: { durationSeconds, fps, mimeType, delivery: response.delivery } },
    };
  }
  const response = await timedSendMessage(driver, dispatch.images, prompt, options);
  return { response, metadata: dispatch.frames ? { frames: dispatch.frames } : {} };
}

/**
 * Decides whether a video input should be delivered natively, honouring
 * `video.mode`. `"native"` on a provider without support throws, but only
 * when the input really is a video, so images and pre-sampled frames pass
 * through untouched whatever the mode says.
 */
function resolveNativeVideo(
  input: MediaInput | FramesInput,
  videoOptions: VideoSamplingOptions | undefined,
  driver: ProviderDriver,
  provider: ProviderName,
): boolean {
  // Widened to string so a value outside the union still gets a clear error at runtime.
  const mode: string = videoOptions?.mode ?? "auto";
  if (mode !== "auto" && mode !== "native" && mode !== "frames") {
    throw new VisualAIConfigError(
      `Invalid video mode: ${mode}. Expected "auto", "native", or "frames".`,
    );
  }
  const supported = typeof driver.sendVideoMessage === "function";
  if (mode === "frames") return false;
  if (mode === "auto") return supported;
  if (!supported && !isFramesInput(input) && isVideoInput(input)) {
    throw new VisualAIConfigError(
      `Native video delivery is not supported by the "${provider}" provider. ` +
        `Use a Google model, or set video: { mode: "frames" } to sample frames instead.`,
    );
  }
  return true;
}

/**
 * Creates a configured visual AI client.
 *
 * @param config Model selection and runtime options for subsequent requests.
 * @returns A `VisualAIClient` instance with check, compare, ask, and template helpers.
 * @throws {VisualAIConfigError} When the provider or model configuration is invalid.
 * @throws {VisualAIAuthError} When required API credentials are missing.
 * @example
 * ```ts
 * import { expect, test } from "@playwright/test";
 * import { visualAI } from "visual-ai-assertions";
 *
 * test("hero loads correctly", async ({ page }) => {
 *   const client = visualAI({
 *     model: "gpt-5-mini",
 *     apiKey: process.env.OPENAI_API_KEY,
 *   });
 *
 *   await page.goto("https://example.com");
 *   const screenshot = await page.screenshot();
 *   const result = await client.check(screenshot, [
 *     "The hero heading is visible",
 *     "There is no loading spinner",
 *   ]);
 *
 *   expect(result.pass).toBe(true);
 * });
 * ```
 */
export function visualAI(config: VisualAIConfig = {}): VisualAIClient {
  const resolvedConfig = resolveConfig(config);
  const driverConfig: ProviderConfig = {
    apiKey: resolvedConfig.apiKey,
    model: resolvedConfig.model,
    maxTokens: resolvedConfig.maxTokens,
    reasoningEffort: resolvedConfig.reasoningEffort,
    imageDetail: resolvedConfig.imageDetail,
    timeout: resolvedConfig.timeout,
  };
  const driver = createDriver(resolvedConfig.provider, driverConfig);
  // Longest-edge pixel cap applied to every image/frame before it reaches a driver.
  const maxImageDimension = resolvedConfig.maxImageDimension;

  async function checkElementsVisibility(
    image: ImageInput,
    elements: string[],
    visible: boolean,
    options?: ElementsVisibilityOptions,
  ): Promise<CheckResult> {
    const methodName = visible ? "elementsVisible" : "elementsHidden";
    if (elements.length === 0) {
      throw new VisualAIConfigError(`At least one element is required for ${methodName}()`);
    }

    return withErrorDebug(resolvedConfig, methodName, async () => {
      const img = await normalizeImage(image, maxImageDimension);
      const prompt = buildElementsVisibilityPrompt(elements, visible, options);
      debugLog(resolvedConfig, `${methodName} prompt`, prompt, "prompt");

      const response = await timedSendMessage(driver, [img], prompt, checkSchemaOptions);
      debugLog(resolvedConfig, `${methodName} response`, response.text, "response");

      const result = parseCheckResponse(response.text);
      return {
        ...result,
        usage: processUsage(methodName, response.usage, response.durationSeconds, resolvedConfig),
      };
    });
  }

  return {
    async check(input, statements, options) {
      const stmts = Array.isArray(statements) ? statements : [statements];
      if (stmts.length === 0) {
        throw new VisualAIConfigError("At least one statement is required for check()");
      }

      return withErrorDebug(resolvedConfig, "check", async () => {
        const nativeVideo = resolveNativeVideo(
          input,
          options?.video,
          driver,
          resolvedConfig.provider,
        );
        const media = await normalizeMedia(input, options?.video, maxImageDimension, nativeVideo);
        const dispatch = mediaToProviderInputs(media);
        const prompt = buildCheckPrompt(stmts, {
          instructions: options?.instructions,
          media: dispatch.mediaContext,
        });
        debugLog(resolvedConfig, "check prompt", prompt, "prompt");

        const { response, metadata } = await sendMedia(
          driver,
          dispatch,
          prompt,
          checkSchemaOptions,
        );
        debugLog(resolvedConfig, "check response", response.text, "response");

        const result = parseCheckResponse(response.text);
        return {
          ...result,
          ...metadata,
          usage: processUsage("check", response.usage, response.durationSeconds, resolvedConfig),
        };
      });
    },

    async ask(input, userPrompt, options) {
      return withErrorDebug(resolvedConfig, "ask", async () => {
        const nativeVideo = resolveNativeVideo(
          input,
          options?.video,
          driver,
          resolvedConfig.provider,
        );
        const media = await normalizeMedia(input, options?.video, maxImageDimension, nativeVideo);
        const dispatch = mediaToProviderInputs(media);
        const prompt = buildAskPrompt(userPrompt, {
          instructions: options?.instructions,
          media: dispatch.mediaContext,
        });
        debugLog(resolvedConfig, "ask prompt", prompt, "prompt");

        const { response, metadata } = await sendMedia(driver, dispatch, prompt, askSchemaOptions);
        debugLog(resolvedConfig, "ask response", response.text, "response");

        const result = parseAskResponse(response.text);
        return {
          ...result,
          ...metadata,
          usage: processUsage("ask", response.usage, response.durationSeconds, resolvedConfig),
        };
      });
    },

    async compare(imageA, imageB, options) {
      return withErrorDebug(resolvedConfig, "compare", async () => {
        const [imgA, imgB] = await Promise.all([
          normalizeImage(imageA, maxImageDimension),
          normalizeImage(imageB, maxImageDimension),
        ]);
        const prompt = buildComparePrompt({
          userPrompt: options?.prompt,
          instructions: options?.instructions,
        });
        debugLog(resolvedConfig, "compare prompt", prompt, "prompt");

        const response = await timedSendMessage(driver, [imgA, imgB], prompt, compareSchemaOptions);
        debugLog(resolvedConfig, "compare response", response.text, "response");

        const supportsAnnotatedDiff =
          resolvedConfig.provider === "google" &&
          resolvedConfig.model === Model.Google.GEMINI_3_FLASH_PREVIEW;
        const effectiveDiffImage = options?.diffImage ?? (supportsAnnotatedDiff ? true : false);

        let diffImage;
        if (effectiveDiffImage) {
          try {
            diffImage = await generateAiDiff(imgA, imgB, resolvedConfig.model, driver);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(
              `[visual-ai-assertions] warning: diff generation failed: ${msg}\n`,
            );
          }
        }

        const result = parseCompareResponse(response.text);
        return {
          ...result,
          ...(diffImage ? { diffImage } : {}),
          usage: processUsage("compare", response.usage, response.durationSeconds, resolvedConfig),
        };
      });
    },

    elementsVisible(image, elements, options) {
      return checkElementsVisibility(image, elements, true, options);
    },

    elementsHidden(image, elements, options) {
      return checkElementsVisibility(image, elements, false, options);
    },

    async accessibility(image, options) {
      return withErrorDebug(resolvedConfig, "accessibility", async () => {
        const img = await normalizeImage(image, maxImageDimension);
        const prompt = buildAccessibilityPrompt(options);
        debugLog(resolvedConfig, "accessibility prompt", prompt, "prompt");

        const response = await timedSendMessage(driver, [img], prompt, checkSchemaOptions);
        debugLog(resolvedConfig, "accessibility response", response.text, "response");

        const result = parseCheckResponse(response.text);
        return {
          ...result,
          usage: processUsage(
            "accessibility",
            response.usage,
            response.durationSeconds,
            resolvedConfig,
          ),
        };
      });
    },

    async layout(image, options) {
      return withErrorDebug(resolvedConfig, "layout", async () => {
        const img = await normalizeImage(image, maxImageDimension);
        const prompt = buildLayoutPrompt(options);
        debugLog(resolvedConfig, "layout prompt", prompt, "prompt");

        const response = await timedSendMessage(driver, [img], prompt, checkSchemaOptions);
        debugLog(resolvedConfig, "layout response", response.text, "response");

        const result = parseCheckResponse(response.text);
        return {
          ...result,
          usage: processUsage("layout", response.usage, response.durationSeconds, resolvedConfig),
        };
      });
    },

    async pageLoad(image, options) {
      return withErrorDebug(resolvedConfig, "pageLoad", async () => {
        const img = await normalizeImage(image, maxImageDimension);
        const prompt = buildPageLoadPrompt(options);
        debugLog(resolvedConfig, "pageLoad prompt", prompt, "prompt");

        const response = await timedSendMessage(driver, [img], prompt, checkSchemaOptions);
        debugLog(resolvedConfig, "pageLoad response", response.text, "response");

        const result = parseCheckResponse(response.text);
        return {
          ...result,
          usage: processUsage("pageLoad", response.usage, response.durationSeconds, resolvedConfig),
        };
      });
    },

    async content(image, options) {
      return withErrorDebug(resolvedConfig, "content", async () => {
        const img = await normalizeImage(image, maxImageDimension);
        const prompt = buildContentPrompt(options);
        debugLog(resolvedConfig, "content prompt", prompt, "prompt");

        const response = await timedSendMessage(driver, [img], prompt, checkSchemaOptions);
        debugLog(resolvedConfig, "content response", response.text, "response");

        const result = parseCheckResponse(response.text);
        return {
          ...result,
          usage: processUsage("content", response.usage, response.durationSeconds, resolvedConfig),
        };
      });
    },
  };
}
