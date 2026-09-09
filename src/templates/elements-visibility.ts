import type { ElementsVisibilityOptions } from "../types.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ELEMENTS_HIDDEN_ROLE =
  "Check whether specific UI elements are absent or hidden in this screenshot.";

/** "a and b" for two clauses, "a, b, and c" for more. */
function joinClauses(clauses: readonly string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? "";
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
}

/**
 * The role names exactly what the enabled rules judge, so the headline never
 * promises more or less than the instructions below it.
 */
function visibleRole(finalState: boolean, requireCorrectRendering: boolean): string {
  const clauses = ["present", "properly visible"];
  if (requireCorrectRendering) clauses.push("correctly rendered");
  if (finalState) clauses.push("in their finished state");
  return `Check whether specific UI elements are ${joinClauses(clauses)} in this screenshot.`;
}

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
 *
 * Something drawn on top of an element splits the same way, and the test is not
 * how much it covers. A price pill or a favourite icon coexists with finished
 * content, and on a typical card those cover more of the image than a spinner
 * does. A spinner covering less of it still means something different: it
 * asserts the element is not ready. So the question is what the overlay says
 * about the element's state, not how much of it you can still see.
 */
const ELEMENTS_VISIBLE_CLIPPING_RULES: readonly string[] = [
  "When an element is partly rendered but cut off at an edge, decide whether ordinary scrolling would bring it fully into view. For example, a card peeking past the end of a horizontal carousel, a filter chip in a row that continues past the screen edge, or a list item partly below the bottom of a scrolling feed is reachable that way, so the check for that element PASSES. Say in your reasoning that it is reached by scrolling.",
  "An element that scrolling cannot bring into view is NOT properly visible: one sliced by the screen edge itself, or cut off or overlapped by fixed chrome such as the status bar, a notch, a home indicator, a sticky header, or a fixed bottom navigation bar. That is a layout fault, so the check for that element FAILS. Describe the clipping in your reasoning.",
  "An element you cannot see at all is not visible, even if the page might reveal it after scrolling. Judge only what this screenshot actually shows.",
];

/**
 * Dropped when the caller passes `finalState: false`, because a screenshot
 * captured mid-load is expected to carry loading chrome. Everything else still
 * applies: whether an element is present, and whether it is clipped or covered,
 * does not depend on the interface having settled.
 */
const ELEMENTS_VISIBLE_FINAL_STATE_RULE =
  "Judge each element in its finished, presented state. Things a design draws on top of an element — a badge, a favourite icon, a duration or price pill, a gradient scrim — coexist with finished content and leave it visible. An overlay that says the element is NOT ready — a loading spinner, a skeleton placeholder, a shimmer, a progress bar, an error or retry overlay — means the element is not properly visible even when you can still make out what sits underneath, so the check for that element FAILS. Name which of the two you are seeing in your reasoning.";

/**
 * Opt-in. Measured on the visibility bench with the rule on and off, five reps
 * each: it caught the one bullet naming a present-but-overlapping element
 * (5/5 on both models, against 3/5 and 0/5 without it) and nothing else, while
 * tripling Gemini's flakiness on unrelated presence questions. A presence
 * assertion should not pay that by default; pass `requireCorrectRendering: true`
 * for the assertions where a rendering defect is the thing being checked.
 *
 * Open-ended defect hunting makes models over-report, which is why the closing
 * sentence draws the line at defects worth arguing about.
 *
 * Misalignment is named even though the models measured so far never report it;
 * a model that can see it should have the instruction available.
 */
const ELEMENTS_VISIBLE_CORRECT_RENDERING_RULE =
  "An element that is present but clearly defective in how it is rendered is NOT properly visible: text at contrast too low to read, elements overlapping or colliding with one another, an element visibly out of alignment with the siblings it should line up with, or text cut off mid-word inside its own container. The check for that element FAILS. In your reasoning, say that the element is present and then name the defect. Only clear, unambiguous defects count: do not fail an element for tight spacing, stylistic choices, or anything you would have to argue for.";

/** A blocking overlay hides an element whether or not the interface has settled. */
const ELEMENTS_VISIBLE_OCCLUSION_RULE =
  "An element a user could not read or use because a modal, dialog, cookie banner, toast or similar overlay covers it is NOT visible: the check for that element FAILS.";

function visibleRules(finalState: boolean, requireCorrectRendering: boolean): readonly string[] {
  return [
    ...ELEMENTS_VISIBLE_CLIPPING_RULES,
    ...(finalState ? [ELEMENTS_VISIBLE_FINAL_STATE_RULE] : []),
    ...(requireCorrectRendering ? [ELEMENTS_VISIBLE_CORRECT_RENDERING_RULE] : []),
    ELEMENTS_VISIBLE_OCCLUSION_RULE,
  ];
}

const ELEMENTS_HIDDEN_BASE_RULES: readonly string[] = [
  "An element that is rendered at all, even partly, is not hidden, so the check for that element FAILS. This includes one peeking past the edge of a scrollable row or feed, which the user reaches by scrolling normally. Note the partial visibility in your reasoning.",
  "An element that appears nowhere in this screenshot counts as hidden, even if the page might reveal it after scrolling. Judge only what this screenshot actually shows.",
];

/** Mirrors the visible side: dropped when the caller says the screen is mid-load. */
const ELEMENTS_HIDDEN_FINAL_STATE_RULE =
  "An element sitting under a loading spinner, skeleton, progress bar or error overlay is still rendered, so it is not hidden and the check for that element FAILS. It is not properly visible either; that is what the visible check is for.";

function hiddenRules(finalState: boolean): readonly string[] {
  return finalState
    ? [...ELEMENTS_HIDDEN_BASE_RULES, ELEMENTS_HIDDEN_FINAL_STATE_RULE]
    : ELEMENTS_HIDDEN_BASE_RULES;
}

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

  // Default: the screenshot shows a settled interface, which is what a test
  // asserting on a finished screen means. `finalState: false` drops the rules
  // that treat loading chrome as a defect.
  const finalState = options?.finalState ?? true;
  // Presence-only by default. `elementsHidden` asks about absence, so a
  // rendering defect cannot change its answer and the option is ignored there.
  const correctRendering = visible && (options?.requireCorrectRendering ?? false);
  const defaultRules = visible
    ? visibleRules(finalState, correctRendering)
    : hiddenRules(finalState);
  const instructions = options?.instructions
    ? [...defaultRules, ...options.instructions]
    : defaultRules;

  const role = visible ? visibleRole(finalState, correctRendering) : ELEMENTS_HIDDEN_ROLE;

  return buildCheckPrompt(statements, { role, instructions });
}
