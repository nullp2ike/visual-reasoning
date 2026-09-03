import { Model, Provider } from "../constants.js";
import type { ProviderName } from "../types.js";

interface ModelPricing {
  inputPricePerToken: number;
  outputPricePerToken: number;
}

const PER_MILLION = 1_000_000;

const PRICING_TABLE: Record<string, ModelPricing> = {
  [`${Provider.ANTHROPIC}:${Model.Anthropic.FABLE_5}`]: {
    inputPricePerToken: 10 / PER_MILLION,
    outputPricePerToken: 50 / PER_MILLION,
  },
  [`${Provider.ANTHROPIC}:${Model.Anthropic.OPUS_5}`]: {
    inputPricePerToken: 5 / PER_MILLION,
    outputPricePerToken: 25 / PER_MILLION,
  },
  [`${Provider.ANTHROPIC}:${Model.Anthropic.OPUS_4_8}`]: {
    inputPricePerToken: 5 / PER_MILLION,
    outputPricePerToken: 25 / PER_MILLION,
  },
  [`${Provider.ANTHROPIC}:${Model.Anthropic.SONNET_5}`]: {
    inputPricePerToken: 3 / PER_MILLION,
    outputPricePerToken: 15 / PER_MILLION,
  },
  [`${Provider.ANTHROPIC}:${Model.Anthropic.OPUS_4_7}`]: {
    inputPricePerToken: 5 / PER_MILLION,
    outputPricePerToken: 25 / PER_MILLION,
  },
  [`${Provider.ANTHROPIC}:${Model.Anthropic.OPUS_4_6}`]: {
    inputPricePerToken: 5 / PER_MILLION,
    outputPricePerToken: 25 / PER_MILLION,
  },
  [`${Provider.ANTHROPIC}:${Model.Anthropic.SONNET_4_6}`]: {
    inputPricePerToken: 3 / PER_MILLION,
    outputPricePerToken: 15 / PER_MILLION,
  },
  [`${Provider.ANTHROPIC}:${Model.Anthropic.HAIKU_4_5}`]: {
    inputPricePerToken: 1 / PER_MILLION,
    outputPricePerToken: 5 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_6_SOL}`]: {
    inputPricePerToken: 5 / PER_MILLION,
    outputPricePerToken: 30 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_6_TERRA}`]: {
    inputPricePerToken: 2 / PER_MILLION,
    outputPricePerToken: 12 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_6_LUNA}`]: {
    inputPricePerToken: 0.2 / PER_MILLION,
    outputPricePerToken: 1.2 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_5}`]: {
    inputPricePerToken: 5 / PER_MILLION,
    outputPricePerToken: 30 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4}`]: {
    inputPricePerToken: 2.5 / PER_MILLION,
    outputPricePerToken: 15 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_PRO}`]: {
    inputPricePerToken: 30 / PER_MILLION,
    outputPricePerToken: 180 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_2}`]: {
    inputPricePerToken: 1.75 / PER_MILLION,
    outputPricePerToken: 14 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_MINI}`]: {
    inputPricePerToken: 0.75 / PER_MILLION,
    outputPricePerToken: 4.5 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_4_NANO}`]: {
    inputPricePerToken: 0.2 / PER_MILLION,
    outputPricePerToken: 1.25 / PER_MILLION,
  },
  [`${Provider.OPENAI}:${Model.OpenAI.GPT_5_MINI}`]: {
    inputPricePerToken: 0.25 / PER_MILLION,
    outputPricePerToken: 2 / PER_MILLION,
  },
  // Introductory pricing through 2026-12-31; reverts to $1.50/$7.50 per MTok
  // on 2027-01-01 (https://blog.google/.../3-8-flash-and-3-8-flash-cyber/).
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_8_FLASH}`]: {
    inputPricePerToken: 0.75 / PER_MILLION,
    outputPricePerToken: 3.75 / PER_MILLION,
  },
  // Introductory pricing through 2026-12-31; reverts to $1.50/$7.50 per MTok
  // on 2027-01-01 (https://blog.google/.../introducing-gemini-3-7-flash/).
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_7_FLASH}`]: {
    inputPricePerToken: 0.75 / PER_MILLION,
    outputPricePerToken: 3.75 / PER_MILLION,
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_6_FLASH}`]: {
    inputPricePerToken: 1.5 / PER_MILLION,
    outputPricePerToken: 7.5 / PER_MILLION,
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_5_FLASH}`]: {
    inputPricePerToken: 1.5 / PER_MILLION,
    outputPricePerToken: 9 / PER_MILLION,
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_5_FLASH_LITE}`]: {
    inputPricePerToken: 0.3 / PER_MILLION,
    outputPricePerToken: 2.5 / PER_MILLION,
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_1_PRO_PREVIEW}`]: {
    inputPricePerToken: 2 / PER_MILLION,
    outputPricePerToken: 12 / PER_MILLION,
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_1_FLASH_LITE}`]: {
    inputPricePerToken: 0.25 / PER_MILLION,
    outputPricePerToken: 1.5 / PER_MILLION,
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_FLASH_PREVIEW}`]: {
    inputPricePerToken: 0.5 / PER_MILLION,
    outputPricePerToken: 3 / PER_MILLION,
  },
  // OpenRouter passes through upstream per-model pricing (verified 2026-09-03
  // against https://openrouter.ai/api/v1/models).
  // Meta's own listed rates ($1.25 / $4.25, cached input $0.15) match
  // OpenRouter's pass-through exactly. Cached input is not modelled here:
  // `calculateCost` applies no cache discount on any provider.
  [`${Provider.OPENROUTER}:${Model.OpenRouter.MUSE_SPARK_1_3}`]: {
    inputPricePerToken: 1.25 / PER_MILLION,
    outputPricePerToken: 4.25 / PER_MILLION,
  },
  // Muse Spark 1.3's data-sharing tier: same model, ~12x cheaper, because
  // Meta trains on everything submitted through it. Deliberately keyed by the
  // literal slug rather than a `Model.OpenRouter` entry — it must never be
  // reachable via autocomplete or default selection. Pass the string yourself
  // (`model: "meta/muse-spark-1.3-contributor"`) to opt in; cost is still
  // tracked correctly once you do. Cached input is $0.002/MTok, not modelled
  // (no provider gets a cache discount here).
  [`${Provider.OPENROUTER}:meta/muse-spark-1.3-contributor`]: {
    inputPricePerToken: 0.1 / PER_MILLION,
    outputPricePerToken: 0.2 / PER_MILLION,
  },
  [`${Provider.OPENROUTER}:${Model.OpenRouter.GROK_4_6}`]: {
    inputPricePerToken: 2 / PER_MILLION,
    outputPricePerToken: 6 / PER_MILLION,
  },
  [`${Provider.OPENROUTER}:${Model.OpenRouter.GROK_4_5}`]: {
    inputPricePerToken: 2 / PER_MILLION,
    outputPricePerToken: 6 / PER_MILLION,
  },
  [`${Provider.OPENROUTER}:${Model.OpenRouter.KIMI_K3}`]: {
    inputPricePerToken: 3 / PER_MILLION,
    outputPricePerToken: 15 / PER_MILLION,
  },
  [`${Provider.OPENROUTER}:${Model.OpenRouter.KIMI_K2_7_CODE}`]: {
    inputPricePerToken: 0.82 / PER_MILLION,
    outputPricePerToken: 3.75 / PER_MILLION,
  },
  [`${Provider.OPENROUTER}:${Model.OpenRouter.QWEN_3_8_MAX}`]: {
    inputPricePerToken: 2 / PER_MILLION,
    outputPricePerToken: 6 / PER_MILLION,
  },
  [`${Provider.OPENROUTER}:${Model.OpenRouter.QWEN_3_7_PLUS}`]: {
    inputPricePerToken: 0.32 / PER_MILLION,
    outputPricePerToken: 1.28 / PER_MILLION,
  },
  [`${Provider.OPENROUTER}:${Model.OpenRouter.QWEN_3_6_FLASH}`]: {
    inputPricePerToken: 0.1875 / PER_MILLION,
    outputPricePerToken: 1.125 / PER_MILLION,
  },
};

export function calculateCost(
  provider: ProviderName,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const key = `${provider}:${model}`;
  const pricing = PRICING_TABLE[key];
  if (!pricing) return undefined;

  return inputTokens * pricing.inputPricePerToken + outputTokens * pricing.outputPricePerToken;
}
