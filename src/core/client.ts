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
  ImageInput,
  LayoutOptions,
  PageLoadOptions,
  ProviderName,
  VisualAIConfig,
} from "../types.js";
import { AnthropicDriver } from "../providers/anthropic.js";
import { GoogleDriver } from "../providers/google.js";
import { OpenAIDriver } from "../providers/openai.js";
import type { ProviderConfig, ProviderDriver } from "../providers/types.js";
import { resolveConfig } from "./config.js";
import { debugLog, processUsage, timedSendMessage } from "./debug.js";
import { generateAiDiff } from "./diff.js";
import { normalizeImage } from "./image.js";
import { buildAskPrompt, buildCheckPrompt, buildComparePrompt } from "./prompt.js";
import { parseAskResponse, parseCheckResponse, parseCompareResponse } from "./response.js";

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
   * Verifies one or more statements against a single image.
   *
   * @param image Image source as a buffer, URL, file path, or base64 string.
   * @param statements One or more statements to validate against the image.
   * @param options Optional additional instructions appended to the prompt.
   * @returns A structured result describing pass/fail, issues, and statement reasoning.
   * @throws {VisualAIConfigError} When no statements are provided.
   * @throws {VisualAIImageError} When the image cannot be loaded or decoded.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * const result = await client.check(screenshot, [
   *   "The primary CTA is visible",
   *   "There is no error banner",
   * ]);
   * ```
   */
  check(
    image: ImageInput,
    statements: string | string[],
    options?: CheckOptions,
  ): Promise<CheckResult>;
  /**
   * Asks an open-ended question about an image and returns a structured summary.
   *
   * @param image Image source as a buffer, URL, file path, or base64 string.
   * @param prompt Prompt describing what to inspect in the image.
   * @param options Optional additional instructions appended to the prompt.
   * @returns A summary with any detected issues.
   * @throws {VisualAIImageError} When the image cannot be loaded or decoded.
   * @throws {VisualAIError} When the provider rejects the request or returns invalid output.
   * @example
   * ```ts
   * const result = await client.ask(screenshot, "What looks visually broken on this page?");
   * ```
   */
  ask(image: ImageInput, prompt: string, options?: AskOptions): Promise<AskResult>;
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
   * Checks that the listed elements are visible in an image.
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
   * Checks that the listed elements are not visible in an image.
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
   * Runs the built-in accessibility template against an image.
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
   * Runs the built-in layout template against an image.
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
   * Runs the built-in page-load template against an image.
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
   * Runs the built-in content template against an image.
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
} as const satisfies Record<ProviderName, ProviderFactory>;

function createDriver(provider: ProviderName, config: ProviderConfig): ProviderDriver {
  return PROVIDER_REGISTRY[provider](config);
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
  };
  const driver = createDriver(resolvedConfig.provider, driverConfig);

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

    const img = await normalizeImage(image);
    const prompt = buildElementsVisibilityPrompt(elements, visible, options);
    debugLog(resolvedConfig, `${methodName} prompt`, prompt);

    const response = await timedSendMessage(driver, [img], prompt);
    debugLog(resolvedConfig, `${methodName} response`, response.text);

    const result = parseCheckResponse(response.text);
    return {
      ...result,
      usage: processUsage(methodName, response.usage, response.durationSeconds, resolvedConfig),
    };
  }

  return {
    async check(image, statements, options) {
      const stmts = Array.isArray(statements) ? statements : [statements];
      if (stmts.length === 0) {
        throw new VisualAIConfigError("At least one statement is required for check()");
      }

      const img = await normalizeImage(image);
      const prompt = buildCheckPrompt(stmts, { instructions: options?.instructions });
      debugLog(resolvedConfig, "check prompt", prompt);

      const response = await timedSendMessage(driver, [img], prompt);
      debugLog(resolvedConfig, "check response", response.text);

      const result = parseCheckResponse(response.text);
      return {
        ...result,
        usage: processUsage("check", response.usage, response.durationSeconds, resolvedConfig),
      };
    },

    async ask(image, userPrompt, options) {
      const img = await normalizeImage(image);
      const prompt = buildAskPrompt(userPrompt, { instructions: options?.instructions });
      debugLog(resolvedConfig, "ask prompt", prompt);

      const response = await timedSendMessage(driver, [img], prompt);
      debugLog(resolvedConfig, "ask response", response.text);

      const result = parseAskResponse(response.text);
      return {
        ...result,
        usage: processUsage("ask", response.usage, response.durationSeconds, resolvedConfig),
      };
    },

    async compare(imageA, imageB, options) {
      const [imgA, imgB] = await Promise.all([normalizeImage(imageA), normalizeImage(imageB)]);
      const prompt = buildComparePrompt({
        userPrompt: options?.prompt,
        instructions: options?.instructions,
      });
      debugLog(resolvedConfig, "compare prompt", prompt);

      const response = await timedSendMessage(driver, [imgA, imgB], prompt);
      debugLog(resolvedConfig, "compare response", response.text);

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
          debugLog(resolvedConfig, "ai diff error", msg);
          if (!resolvedConfig.debug) {
            process.stderr.write(
              `[visual-ai-assertions] warning: diff generation failed: ${msg}\n`,
            );
          }
        }
      }

      const result = parseCompareResponse(response.text);
      return {
        ...result,
        ...(diffImage ? { diffImage } : {}),
        usage: processUsage("compare", response.usage, response.durationSeconds, resolvedConfig),
      };
    },

    elementsVisible(image, elements, options) {
      return checkElementsVisibility(image, elements, true, options);
    },

    elementsHidden(image, elements, options) {
      return checkElementsVisibility(image, elements, false, options);
    },

    async accessibility(image, options) {
      const img = await normalizeImage(image);
      const prompt = buildAccessibilityPrompt(options);
      debugLog(resolvedConfig, "accessibility prompt", prompt);

      const response = await timedSendMessage(driver, [img], prompt);
      debugLog(resolvedConfig, "accessibility response", response.text);

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
    },

    async layout(image, options) {
      const img = await normalizeImage(image);
      const prompt = buildLayoutPrompt(options);
      debugLog(resolvedConfig, "layout prompt", prompt);

      const response = await timedSendMessage(driver, [img], prompt);
      debugLog(resolvedConfig, "layout response", response.text);

      const result = parseCheckResponse(response.text);
      return {
        ...result,
        usage: processUsage("layout", response.usage, response.durationSeconds, resolvedConfig),
      };
    },

    async pageLoad(image, options) {
      const img = await normalizeImage(image);
      const prompt = buildPageLoadPrompt(options);
      debugLog(resolvedConfig, "pageLoad prompt", prompt);

      const response = await timedSendMessage(driver, [img], prompt);
      debugLog(resolvedConfig, "pageLoad response", response.text);

      const result = parseCheckResponse(response.text);
      return {
        ...result,
        usage: processUsage("pageLoad", response.usage, response.durationSeconds, resolvedConfig),
      };
    },

    async content(image, options) {
      const img = await normalizeImage(image);
      const prompt = buildContentPrompt(options);
      debugLog(resolvedConfig, "content prompt", prompt);

      const response = await timedSendMessage(driver, [img], prompt);
      debugLog(resolvedConfig, "content response", response.text);

      const result = parseCheckResponse(response.text);
      return {
        ...result,
        usage: processUsage("content", response.usage, response.durationSeconds, resolvedConfig),
      };
    },
  };
}
