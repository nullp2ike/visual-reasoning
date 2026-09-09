import type { ElementsVisibilityOptions } from "../types.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ELEMENTS_VISIBLE_ROLE =
  "Check whether specific UI elements are present and properly visible in this screenshot.";

const ELEMENTS_HIDDEN_ROLE =
  "Check whether specific UI elements are absent or hidden in this screenshot.";

/**
 * Being cut off at an edge means two opposite things, and the difference is the
 * judgement a human tester makes without thinking about it.
 *
 * A card peeking past the end of a carousel is not a defect: the peek is how
 * the interface advertises that the row scrolls, and the user reaches the card
 * normally. Failing that check would report a bug that does not exist, which is
 * what a naive "partial means fail" rule does to every scrollable row.
 *
 * A control sliced by the status bar or the home indicator is a defect: no
 * amount of scrolling brings it into view.
 *
 * A single screenshot does not record whether a surface scrolls, so the model
 * has to infer it from layout convention, the same way a person does.
 */
const ELEMENTS_VISIBLE_EDGE_RULES: readonly string[] = [
  "When an element is partly rendered but cut off at an edge, decide whether ordinary scrolling would bring it fully into view. A card peeking past the end of a horizontal carousel, a filter chip in a row that continues past the screen edge, or a list item partly below the bottom of a scrolling feed is reachable that way, so the check for that element PASSES. Say in your reasoning that it is reached by scrolling.",
  "An element that scrolling cannot bring into view is NOT properly visible: one sliced by the screen edge itself, or cut off or overlapped by fixed chrome such as the status bar, a notch, a home indicator, a sticky header, or a fixed bottom navigation bar. That is a layout fault, so the check for that element FAILS. Describe the clipping in your reasoning.",
  "An element you cannot see at all is not visible, even if the page might reveal it after scrolling. Judge only what this screenshot actually shows.",
];

const ELEMENTS_HIDDEN_EDGE_RULES: readonly string[] = [
  "An element that is rendered at all, even partly, is not hidden, so the check for that element FAILS. This includes one peeking past the edge of a scrollable row or feed, which the user reaches by scrolling normally. Note the partial visibility in your reasoning.",
  "An element that appears nowhere in this screenshot counts as hidden, even if the page might reveal it after scrolling. Judge only what this screenshot actually shows.",
];

export function buildElementsVisibilityPrompt(
  elements: string[],
  visible: boolean,
  options?: ElementsVisibilityOptions,
): string {
  // "visible" rather than "fully visible": an element reached by scrolling
  // counts, and a headline that said otherwise would contradict the edge rules.
  const statements = visible
    ? elements.map((el) => `The element "${el}" is visible on the page`)
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
