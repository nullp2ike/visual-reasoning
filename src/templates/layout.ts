import type { LayoutOptions } from "../types.js";
import { Layout, type LayoutCheckName } from "../constants.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ALL_CHECKS: LayoutCheckName[] = Object.values(Layout);

const LAYOUT_ROLE =
  "Evaluate this screenshot for visual layout problems — overlapping elements, content that appears cut off or overflowing, and inconsistent alignment patterns.";

const LAYOUT_EDGE_RULES: readonly string[] = [
  "Intentional overlaps (stacked avatars, dropdown menus, overlapping cards) are acceptable. Flag only overlaps that obscure content or appear broken.",
  "Scrollable containers with partially visible content are not overflow issues.",
];

const CHECK_STATEMENTS: Record<LayoutCheckName, string> = {
  [Layout.OVERLAP]:
    "No elements overlap each other unintentionally — all content is clearly separated and readable",
  [Layout.OVERFLOW]:
    "No content appears to be unintentionally cut off or extending beyond its container boundaries",
  [Layout.ALIGNMENT]:
    "Elements are properly aligned — text, images, and UI components follow a consistent grid or alignment pattern",
};

export function buildLayoutPrompt(options?: LayoutOptions): string {
  const checks = options?.checks ?? [...ALL_CHECKS];
  const statements = checks.map((c) => CHECK_STATEMENTS[c]);

  const instructions = options?.instructions
    ? [...LAYOUT_EDGE_RULES, ...options.instructions]
    : LAYOUT_EDGE_RULES;

  return buildCheckPrompt(statements, { role: LAYOUT_ROLE, instructions });
}
