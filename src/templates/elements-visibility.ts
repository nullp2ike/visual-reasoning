import type { ElementsVisibilityOptions } from "../types.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ELEMENTS_VISIBLE_ROLE =
  "Check whether specific UI elements are present and fully visible in this screenshot.";

const ELEMENTS_HIDDEN_ROLE =
  "Check whether specific UI elements are absent or hidden in this screenshot.";

const ELEMENTS_VISIBLE_EDGE_RULES: readonly string[] = [
  "If an element is partially visible (cut off by screenshot boundary), it is NOT considered fully visible — the check for that element should fail. Note the partial visibility in your reasoning.",
];

const ELEMENTS_HIDDEN_EDGE_RULES: readonly string[] = [
  "If an element is partially visible (cut off by screenshot boundary), it is NOT considered hidden — the check for that element should fail. Note the partial visibility in your reasoning.",
];

export function buildElementsVisibilityPrompt(
  elements: string[],
  visible: boolean,
  options?: ElementsVisibilityOptions,
): string {
  const statements = visible
    ? elements.map((el) => `The element "${el}" is fully visible on the page`)
    : elements.map((el) => `The element "${el}" is NOT visible on the page`);

  const defaultRules = visible ? ELEMENTS_VISIBLE_EDGE_RULES : ELEMENTS_HIDDEN_EDGE_RULES;
  const instructions = options?.instructions
    ? [...defaultRules, ...options.instructions]
    : defaultRules;

  return buildCheckPrompt(statements, {
    role: visible ? ELEMENTS_VISIBLE_ROLE : ELEMENTS_HIDDEN_ROLE,
    instructions,
  });
}
