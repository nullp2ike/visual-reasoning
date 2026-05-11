import type { AccessibilityOptions } from "../types.js";
import { Accessibility, type AccessibilityCheckName } from "../constants.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ALL_CHECKS: AccessibilityCheckName[] = Object.values(Accessibility);

const ACCESSIBILITY_ROLE =
  "Evaluate this screenshot for visual accessibility. Focus on what you can actually perceive — apparent contrast levels, text legibility, and visual distinctiveness of interactive elements.";

const ACCESSIBILITY_EDGE_RULES: readonly string[] = [
  "Do not state specific contrast ratios. Describe contrast as 'appears sufficient' or 'appears low'.",
  "Dark mode and light mode themes are both valid. Do not flag a valid dark theme as a contrast issue.",
  "Purely decorative color (branding, backgrounds, gradients) is not a color-blindness or color-alone issue — only flag color usage that carries meaning a user must perceive to use the interface.",
  "Only evaluate color cues that are visible in the screenshot. Do not assume hover/focus state colors exist if they are not shown.",
];

const CHECK_STATEMENTS: Record<AccessibilityCheckName, string> = {
  [Accessibility.CONTRAST]:
    "All text and interactive elements appear to have sufficient color contrast — text is clearly readable against its background",
  [Accessibility.READABILITY]:
    "All text is readable — no text is cut off, overlapping, too small to read, or obscured by background images",
  [Accessibility.INTERACTIVE_VISIBILITY]:
    "All interactive elements (buttons, links, inputs) are clearly identifiable and visually distinct from non-interactive content",
  [Accessibility.COLOR_BLINDNESS]:
    "Information conveyed by color remains distinguishable to viewers with common color vision deficiencies — status indicators, chart series, and other meaningful color pairings do not rely on hue combinations that are commonly confused (e.g., red/green, blue/purple)",
  [Accessibility.COLOR_ALONE]:
    "Information conveyed by color is also conveyed through at least one non-color cue — text labels, icons, shapes, patterns, underlines, or position accompany any color-based meaning (e.g., required fields, error states, chart legends, link styling)",
};

export function buildAccessibilityPrompt(options?: AccessibilityOptions): string {
  const checks = options?.checks ?? [...ALL_CHECKS];
  const statements = checks.map((c) => CHECK_STATEMENTS[c]);

  const instructions = options?.instructions
    ? [...ACCESSIBILITY_EDGE_RULES, ...options.instructions]
    : ACCESSIBILITY_EDGE_RULES;

  return buildCheckPrompt(statements, {
    role: ACCESSIBILITY_ROLE,
    instructions,
  });
}
