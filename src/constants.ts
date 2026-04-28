import type { ProviderName } from "./types.js";

// --- Reasoning effort constants ---

/** Supported reasoning effort levels. */
export const ReasoningEffort = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
} as const;

/** Union of valid reasoning effort values, derived from the ReasoningEffort constant. */
export type ReasoningEffortLevel = (typeof ReasoningEffort)[keyof typeof ReasoningEffort];

// --- Provider constants ---

/** Supported provider identifiers used internally for pricing and provider selection. */
export const Provider = {
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
  GOOGLE: "google",
} as const satisfies Record<string, ProviderName>;

// --- Model constants (grouped by provider) ---

/** Known model names grouped by provider. */
export const Model = {
  Anthropic: {
    OPUS_4_7: "claude-opus-4-7",
    OPUS_4_6: "claude-opus-4-6",
    SONNET_4_6: "claude-sonnet-4-6",
    HAIKU_4_5: "claude-haiku-4-5",
  },
  OpenAI: {
    GPT_5_5: "gpt-5.5",
    GPT_5_4: "gpt-5.4",
    GPT_5_4_PRO: "gpt-5.4-pro",
    GPT_5_4_MINI: "gpt-5.4-mini",
    GPT_5_4_NANO: "gpt-5.4-nano",
    GPT_5_2: "gpt-5.2",
    GPT_5_MINI: "gpt-5-mini",
  },
  Google: {
    GEMINI_3_1_PRO_PREVIEW: "gemini-3.1-pro-preview",
    GEMINI_3_1_FLASH_LITE_PREVIEW: "gemini-3.1-flash-lite-preview",
    GEMINI_3_FLASH_PREVIEW: "gemini-3-flash-preview",
  },
} as const;

// --- Derived utility types ---

/** Union of all built-in model name literals exposed by `Model`. */
export type KnownModelName =
  | (typeof Model.Anthropic)[keyof typeof Model.Anthropic]
  | (typeof Model.OpenAI)[keyof typeof Model.OpenAI]
  | (typeof Model.Google)[keyof typeof Model.Google];

// --- Default model per provider ---

/** Default model selection used when a caller omits `config.model`. */
export const DEFAULT_MODELS = {
  [Provider.ANTHROPIC]: Model.Anthropic.SONNET_4_6,
  [Provider.OPENAI]: Model.OpenAI.GPT_5_4_MINI,
  [Provider.GOOGLE]: Model.Google.GEMINI_3_FLASH_PREVIEW,
} as const satisfies Record<ProviderName, KnownModelName>;

export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Increased token budget for OpenAI when reasoning effort is high/xhigh.
 * Reasoning tokens share the output budget on OpenAI, so the default 4096
 * is insufficient for higher reasoning levels.
 */
export const OPENAI_REASONING_MAX_TOKENS = 16384;

// --- Reverse map: model → provider ---

export const MODEL_TO_PROVIDER: ReadonlyMap<string, ProviderName> = new Map([
  ...Object.values(Model.Anthropic).map((m) => [m, Provider.ANTHROPIC] as const),
  ...Object.values(Model.OpenAI).map((m) => [m, Provider.OPENAI] as const),
  ...Object.values(Model.Google).map((m) => [m, Provider.GOOGLE] as const),
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
} as const;

// --- Derived check-name union types ---

/** Union of all built-in content check names. */
export type ContentCheckName = (typeof Content)[keyof typeof Content];
/** Union of all built-in layout check names. */
export type LayoutCheckName = (typeof Layout)[keyof typeof Layout];
/** Union of all built-in accessibility check names. */
export type AccessibilityCheckName = (typeof Accessibility)[keyof typeof Accessibility];
