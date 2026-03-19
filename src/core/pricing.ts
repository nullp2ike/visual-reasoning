import { Model, Provider } from "../constants.js";
import type { ProviderName } from "../types.js";

interface ModelPricing {
  inputPricePerToken: number;
  outputPricePerToken: number;
}

const PER_MILLION = 1_000_000;

const PRICING_TABLE: Record<string, ModelPricing> = {
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
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_1_PRO_PREVIEW}`]: {
    inputPricePerToken: 2 / PER_MILLION,
    outputPricePerToken: 12 / PER_MILLION,
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_1_FLASH_LITE_PREVIEW}`]: {
    inputPricePerToken: 0.25 / PER_MILLION,
    outputPricePerToken: 1.5 / PER_MILLION,
  },
  [`${Provider.GOOGLE}:${Model.Google.GEMINI_3_FLASH_PREVIEW}`]: {
    inputPricePerToken: 0.5 / PER_MILLION,
    outputPricePerToken: 3 / PER_MILLION,
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
