import type { ProviderName } from "./types.js";

// --- Reasoning effort constants ---

/** Supported reasoning effort levels. */
/**
 * Abstract reasoning-effort hint. Each provider driver maps it to its native
 * mechanism; levels a provider lacks clamp to its nearest tier.
 *
 * `minimal` is **not universally accepted**. OpenAI rejects it per-model with
 * HTTP 400 ("Unsupported value: 'minimal' is not supported with the
 * '<model>' model"), observed on `gpt-6-astra` and `gpt-6.1-sol`, whose
 * supported set is low/medium/high/xhigh/max, and on `gpt-6-sol` and
 * `gpt-6-luna`, which accept none/low/medium/high/xhigh/max. Gemini defines
 * the tier but some models (e.g. Gemini 3.1 Pro) reject it, so Google and
 * OpenRouter clamp it to `low` rather than send it. Use `minimal` only
 * against an OpenAI model known to accept it; `low` is the portable floor.
 */
export const ReasoningEffort = {
  MINIMAL: "minimal",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
} as const;

/** Union of valid reasoning effort values, derived from the ReasoningEffort constant. */
export type ReasoningEffortLevel = (typeof ReasoningEffort)[keyof typeof ReasoningEffort];

// --- Image fidelity constants ---

/**
 * Abstract image-detail hint. Each provider driver maps it to its native
 * mechanism (OpenAI/OpenRouter `detail`, Google `mediaResolution`); Anthropic
 * has no equivalent (Claude auto-downscales to ~1568px / 1.15MP regardless).
 * `"auto"` sends no detail field, preserving each provider's default.
 */
export const ImageDetail = {
  AUTO: "auto",
  LOW: "low",
  HIGH: "high",
} as const;

/** Union of valid image-detail values, derived from the ImageDetail constant. */
export type ImageDetailLevel = (typeof ImageDetail)[keyof typeof ImageDetail];

/** Default image-detail hint: `"auto"` leaves each provider's own default in place. */
export const DEFAULT_IMAGE_DETAIL: ImageDetailLevel = ImageDetail.AUTO;

/**
 * Longest-edge pixel cap applied when normalizing images before they reach a
 * provider. 1568 matches Anthropic's recommended max edge (images within a
 * 1568px box stay under Claude's ~1.15MP limit). Raising it only affects
 * providers that also accept a higher-resolution request (e.g. OpenAI at
 * `detail:"high"`, which scales into a 2048px box); Anthropic re-downscales.
 */
export const DEFAULT_MAX_IMAGE_DIMENSION = 1568;

// --- Provider constants ---

/** Supported provider identifiers used internally for pricing and provider selection. */
export const Provider = {
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
  GOOGLE: "google",
  OPENROUTER: "openrouter",
} as const satisfies Record<string, ProviderName>;

// --- Model constants (grouped by provider) ---

/** Known model names grouped by provider. */
export const Model = {
  Anthropic: {
    FABLE_5_1: "claude-fable-5-1",
    FABLE_5: "claude-fable-5",
    OPUS_5_5: "claude-opus-5-5",
    OPUS_5: "claude-opus-5",
    OPUS_4_8: "claude-opus-4-8",
    OPUS_4_7: "claude-opus-4-7",
    OPUS_4_6: "claude-opus-4-6",
    SONNET_5_5: "claude-sonnet-5-5",
    SONNET_5: "claude-sonnet-5",
    SONNET_4_6: "claude-sonnet-4-6",
    HAIKU_5_5: "claude-haiku-5-5",
    HAIKU_4_5: "claude-haiku-4-5",
  },
  OpenAI: {
    GPT_6_ASTRA: "gpt-6-astra",
    GPT_6_1_SOL: "gpt-6.1-sol",
    GPT_6_SOL: "gpt-6-sol",
    GPT_6_LUNA: "gpt-6-luna",
    GPT_5_6_SOL: "gpt-5.6-sol",
    GPT_5_6_TERRA: "gpt-5.6-terra",
    GPT_5_6_LUNA: "gpt-5.6-luna",
    GPT_5_5: "gpt-5.5",
    GPT_5_4: "gpt-5.4",
    GPT_5_4_PRO: "gpt-5.4-pro",
    GPT_5_4_MINI: "gpt-5.4-mini",
    GPT_5_4_NANO: "gpt-5.4-nano",
    GPT_5_2: "gpt-5.2",
    GPT_5_MINI: "gpt-5-mini",
  },
  Google: {
    GEMINI_3_8_FLASH: "gemini-3.8-flash",
    GEMINI_3_7_FLASH: "gemini-3.7-flash",
    GEMINI_3_6_FLASH: "gemini-3.6-flash",
    GEMINI_3_5_FLASH: "gemini-3.5-flash",
    GEMINI_3_5_FLASH_LITE: "gemini-3.5-flash-lite",
    GEMINI_3_1_PRO_PREVIEW: "gemini-3.1-pro-preview",
    GEMINI_3_1_FLASH_LITE: "gemini-3.1-flash-lite",
    GEMINI_3_FLASH_PREVIEW: "gemini-3-flash-preview",
  },
  /**
   * Models routed through OpenRouter (https://openrouter.ai). Slugs always
   * carry a vendor prefix (`vendor/model`), which is how provider inference
   * recognizes them. All listed models accept image input.
   */
  OpenRouter: {
    MUSE_SPARK_1_3: "meta/muse-spark-1.3",
    GROK_4_7: "x-ai/grok-4.7",
    GROK_4_6: "x-ai/grok-4.6",
    GROK_4_5: "x-ai/grok-4.5",
    KIMI_K3: "moonshotai/kimi-k3",
    KIMI_K2_7_CODE: "moonshotai/kimi-k2.7-code",
    QWEN_3_8_MAX: "qwen/qwen3.8-max",
    QWEN_3_7_PLUS: "qwen/qwen3.7-plus",
    QWEN_3_6_FLASH: "qwen/qwen3.6-flash",
    GLM_5_3_FLASH: "z-ai/glm-5.3-flash",
    MIMO_V2_6_PRO: "xiaomi/mimo-v2.6-pro",
  },
} as const;

// --- Derived utility types ---

/** Union of all built-in model name literals exposed by `Model`. */
export type KnownModelName =
  | (typeof Model.Anthropic)[keyof typeof Model.Anthropic]
  | (typeof Model.OpenAI)[keyof typeof Model.OpenAI]
  | (typeof Model.Google)[keyof typeof Model.Google]
  | (typeof Model.OpenRouter)[keyof typeof Model.OpenRouter];

// --- Default model per provider ---

/**
 * Default model selection used when a caller omits `config.model`.
 *
 * Two of these carry constraints the older defaults did not:
 * - `gpt-6.1-sol` rejects `reasoningEffort: "minimal"` (and `none`) with HTTP
 *   400; `low` is the floor. See the `ReasoningEffort` note above.
 * - `meta/muse-spark-1.3` is age-gated on OpenRouter and returns HTTP 403 until
 *   the account completes the 18+ confirmation at
 *   openrouter.ai/settings/preferences. It also reasons by default (~370-814
 *   reasoning tokens per call) even with no effort configured, so cost per call
 *   runs above what its headline rate suggests.
 */
export const DEFAULT_MODELS = {
  [Provider.ANTHROPIC]: Model.Anthropic.SONNET_5_5,
  [Provider.OPENAI]: Model.OpenAI.GPT_6_1_SOL,
  [Provider.GOOGLE]: Model.Google.GEMINI_3_8_FLASH,
  [Provider.OPENROUTER]: Model.OpenRouter.MUSE_SPARK_1_3,
} as const satisfies Record<ProviderName, KnownModelName>;

export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Increased token budget for OpenAI when reasoning effort is high/xhigh.
 * Reasoning tokens share the output budget on OpenAI, so the default 4096
 * is insufficient for higher reasoning levels.
 */
export const OPENAI_REASONING_MAX_TOKENS = 16384;

/**
 * Budget for `MODELS_REQUIRING_LARGE_OUTPUT_BUDGET`. OpenAI's reasoning guide
 * recommends reserving "at least 25,000 tokens for reasoning and outputs" when
 * starting out; this leaves headroom above that while still capping cost. The
 * listed models' longest observed calls stayed under 9000 output tokens, and at
 * their output prices a call that used the whole budget would cost at most
 * about $0.20 (qwen3.8-max, $6/MTok).
 */
export const OPENAI_HEAVY_REASONING_MAX_TOKENS = 32768;

/**
 * Models that exhaust `DEFAULT_MAX_TOKENS` on reasoning at *every* effort
 * level, not just high/xhigh, and so return status "incomplete" with no
 * visible answer. They get `OPENAI_HEAVY_REASONING_MAX_TOKENS` by default
 * regardless of `reasoningEffort`; an explicit `maxTokens` still wins.
 *
 * `gpt-6-astra` was listed here after image `ask()` calls truncated at 4096
 * and even 16384. That turned out to be the image response schema requiring
 * the video-only `frameReferences` (see `AskImageResponseSchema`), not
 * reasoning: the model printed whitespace until the budget ran out. With that
 * fixed, Astra completed `ask()` and `check()` at 4096 and never exceeded 548
 * output tokens on the discovery bench, so it was removed.
 *
 * The Qwen entries were verified live at the 4096 default with that fix in
 * place. Unlike Astra they genuinely reason past it (4500-5400 reasoning tokens
 * on long calls, under 600 visible): at `medium`, qwen3.8-max truncated 5/8
 * `ask()` and 3/8 `check()` calls and qwen3.7-plus 5/8 `ask()`; with this
 * budget both completed 16/16. grok-4.7 reasons as long but never truncated,
 * since its upstream does not count reasoning against `max_tokens`.
 *
 * kimi-k2.7-code is deliberately absent. It truncates ~8% of calls at 4096,
 * but those are calls where it writes prose instead of JSON: at 32768 they
 * finish and fail to parse instead (~12%), so a larger budget only makes each
 * failure cost more.
 */
export const MODELS_REQUIRING_LARGE_OUTPUT_BUDGET: ReadonlySet<string> = new Set<string>([
  Model.OpenRouter.QWEN_3_8_MAX,
  Model.OpenRouter.QWEN_3_7_PLUS,
]);

// --- Reverse map: model → provider ---

export const MODEL_TO_PROVIDER: ReadonlyMap<string, ProviderName> = new Map([
  ...Object.values(Model.Anthropic).map((m) => [m, Provider.ANTHROPIC] as const),
  ...Object.values(Model.OpenAI).map((m) => [m, Provider.OPENAI] as const),
  ...Object.values(Model.Google).map((m) => [m, Provider.GOOGLE] as const),
  ...Object.values(Model.OpenRouter).map((m) => [m, Provider.OPENROUTER] as const),
]);

// --- Valid providers array ---

/** List of accepted provider names for validation and public consumption. */
export const VALID_PROVIDERS: readonly ProviderName[] = Object.values(Provider);

// --- Provider default reasoning ---

/**
 * What each provider uses when no reasoning effort is explicitly requested.
 * These are informational only — displayed in usage logs, not sent to providers.
 */
export const PROVIDER_DEFAULT_REASONING: Readonly<Record<ProviderName, string>> = {
  openai: "medium",
  anthropic: "off",
  google: "off",
  // Varies by upstream model; the driver sends no reasoning field unless configured.
  openrouter: "off",
};

// --- Check name constants ---

/** Built-in content checks available through `client.content()`. */
export const Content = {
  /** Detects Lorem ipsum, TODO, TBD, and similar placeholder text */
  PLACEHOLDER_TEXT: "placeholder-text",
  /** Detects error messages, banners, stack traces, or error codes */
  ERROR_MESSAGES: "error-messages",
  /** Detects broken image icons or failed-to-load image indicators */
  BROKEN_IMAGES: "broken-images",
  /** Detects UI elements that unintentionally overlap and obscure content */
  OVERLAPPING_ELEMENTS: "overlapping-elements",
} as const;

/** Built-in layout checks available through `client.layout()`. */
export const Layout = {
  /** Detects elements that unintentionally overlap each other */
  OVERLAP: "overlap",
  /** Detects content cut off or extending beyond container boundaries */
  OVERFLOW: "overflow",
  /** Detects inconsistent alignment of text, images, and UI components */
  ALIGNMENT: "alignment",
} as const;

/** Built-in accessibility checks available through `client.accessibility()`. */
export const Accessibility = {
  /** Detects insufficient color contrast between text and backgrounds */
  CONTRAST: "contrast",
  /** Detects text that is cut off, overlapping, too small, or obscured */
  READABILITY: "readability",
  /** Detects interactive elements that are not visually distinct */
  INTERACTIVE_VISIBILITY: "interactive-visibility",
  /** Detects color choices likely to be indistinguishable to viewers with common color vision deficiencies */
  COLOR_BLINDNESS: "color-blindness",
  /** Detects information conveyed by color alone, without a non-color cue (icon, text, pattern, position) */
  COLOR_ALONE: "color-alone",
} as const;

// --- Derived check-name union types ---

/** Union of all built-in content check names. */
export type ContentCheckName = (typeof Content)[keyof typeof Content];
/** Union of all built-in layout check names. */
export type LayoutCheckName = (typeof Layout)[keyof typeof Layout];
/** Union of all built-in accessibility check names. */
export type AccessibilityCheckName = (typeof Accessibility)[keyof typeof Accessibility];
