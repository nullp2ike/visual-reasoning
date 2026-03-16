import type { ContentOptions } from "../types.js";
import { Content, type ContentCheckName } from "../constants.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ALL_CHECKS: ContentCheckName[] = Object.values(Content);

const CONTENT_ROLE =
  "Evaluate this screenshot for content quality problems — placeholder or dummy content, error states, and broken resources that should not appear in a production UI.";

const CHECK_STATEMENTS: Record<ContentCheckName, string> = {
  [Content.PLACEHOLDER_TEXT]:
    "No placeholder text like 'Lorem ipsum', 'TODO', 'TBD', 'placeholder', or similar dummy content is visible on the page",
  [Content.ERROR_MESSAGES]:
    "No error messages, error banners, stack traces, or error codes are visible on the page",
  [Content.BROKEN_IMAGES]:
    "No broken image icons, missing image placeholders, or failed-to-load image indicators are visible",
  [Content.OVERLAPPING_ELEMENTS]:
    "No UI elements are unintentionally overlapping each other, obscuring text, buttons, or other interactive content",
};

export function buildContentPrompt(options?: ContentOptions): string {
  const checks = options?.checks ?? [...ALL_CHECKS];
  const statements = checks.map((c) => CHECK_STATEMENTS[c]);

  return buildCheckPrompt(statements, {
    role: CONTENT_ROLE,
    instructions: options?.instructions,
  });
}
