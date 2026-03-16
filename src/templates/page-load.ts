import type { PageLoadOptions } from "../types.js";
import { buildCheckPrompt } from "../core/prompt.js";

const PAGE_LOAD_ROLE =
  "Evaluate whether this page has finished loading. Look for loading indicators, empty content areas, and missing resources.";

export function buildPageLoadPrompt(options?: PageLoadOptions): string {
  const expectLoaded = options?.expectLoaded ?? true;

  const statements = expectLoaded
    ? [
        "The page content has finished loading — no spinning indicators, skeleton placeholders, or progress bars are visible",
        "The main content area has actual content displayed (not blank or empty)",
        "No broken image icons or missing resource indicators are visible",
      ]
    : [
        "The page shows a loading state — loading spinners, skeleton screens, or progress indicators are visible",
      ];

  return buildCheckPrompt(statements, {
    role: PAGE_LOAD_ROLE,
    instructions: options?.instructions,
  });
}
