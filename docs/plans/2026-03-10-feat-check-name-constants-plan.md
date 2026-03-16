---
title: "feat: Add exported check name constants for IDE autocomplete"
type: feat
status: completed
date: 2026-03-10
---

# feat: Add exported check name constants for IDE autocomplete

## Overview

The `content()`, `layout()`, and `accessibility()` client methods accept a `checks` option array, but the valid check names are bare strings that users must memorize. Add exported `as const` constant objects following the existing `Provider`/`Model` pattern so users get IDE autocomplete and can write:

```typescript
import { Check } from "visual-ai-assertions";

const result = await client.content(screenshot, {
  checks: [Check.Content.PLACEHOLDER_TEXT, Check.Content.ERROR_MESSAGES],
});
```

Users should use the `Check` constants rather than raw strings.

## Problem Statement

Check name strings are duplicated in **three** places with no single source of truth:

1. Template `ALL_CHECKS` tuples (`src/templates/content.ts:4`, etc.)
2. Inline union types in option interfaces (`src/types.ts:158,163,173`)
3. `CHECK_STATEMENTS` record keys (derived from #1, but only within each template)

Users have no discoverability — they must read docs or source code to know valid check names. Adding a new check requires manual updates in multiple files with no compile-time enforcement that they stay in sync.

## Proposed Solution

### Naming: nested `Check` object

Follow the `Model.Anthropic.SONNET_4_6` pattern with a single `Check` namespace:

```typescript
// src/constants.ts
export const Check = {
  Content: {
    /** Detects Lorem ipsum, TODO, TBD, and similar placeholder text */
    PLACEHOLDER_TEXT: "placeholder-text",
    /** Detects error messages, banners, stack traces, or error codes */
    ERROR_MESSAGES: "error-messages",
    /** Detects broken image icons or failed-to-load image indicators */
    BROKEN_IMAGES: "broken-images",
  },
  Layout: {
    /** Detects elements that unintentionally overlap each other */
    OVERLAP: "overlap",
    /** Detects content cut off or extending beyond container boundaries */
    OVERFLOW: "overflow",
    /** Detects inconsistent alignment of text, images, and UI components */
    ALIGNMENT: "alignment",
  },
  Accessibility: {
    /** Detects insufficient color contrast between text and backgrounds */
    CONTRAST: "contrast",
    /** Detects text that is cut off, overlapping, too small, or obscured */
    READABILITY: "readability",
    /** Detects interactive elements that are not visually distinct */
    INTERACTIVE_VISIBILITY: "interactive-visibility",
  },
} as const;
```

### Derived types replace inline unions

```typescript
// src/constants.ts
export type ContentCheckName = (typeof Check.Content)[keyof typeof Check.Content];
export type LayoutCheckName = (typeof Check.Layout)[keyof typeof Check.Layout];
export type AccessibilityCheckName = (typeof Check.Accessibility)[keyof typeof Check.Accessibility];
```

```typescript
// src/types.ts — option interfaces derive from constants
export interface ContentOptions {
  checks?: ContentCheckName[];
  edgeCaseRules?: readonly string[];
}
// (same pattern for LayoutOptions, AccessibilityOptions)
```

### Templates derive from constants

Each template's internal `ALL_CHECKS` and `CHECK_STATEMENTS` typing is derived from the `Check` constants, eliminating the third copy:

```typescript
// src/templates/content.ts
import { Check, type ContentCheckName } from "../constants.js";

const ALL_CHECKS = Object.values(Check.Content) as ContentCheckName[];

const CHECK_STATEMENTS: Record<ContentCheckName, string> = {
  [Check.Content.PLACEHOLDER_TEXT]: "No placeholder text like 'Lorem ipsum'...",
  [Check.Content.ERROR_MESSAGES]: "No error messages...",
  [Check.Content.BROKEN_IMAGES]: "No broken image icons...",
};
```

## Technical Considerations

- **Cross-category type safety**: `client.content(img, { checks: [Check.Layout.OVERLAP] })` is a compile-time error because `"overlap"` is not in the `ContentCheckName` union.
- **Build output**: Verify `.d.ts` files preserve literal types (not widened to `string`). The `as const` pattern is well-supported by tsup.
- **Import direction**: `constants.ts` has no new imports (check values are string literals). `types.ts` imports type-only from `constants.ts`. Templates import from `constants.ts`. No circular dependency risk.
- **Excluded templates**: `pageLoad` (boolean `expectLoaded`) and `missingElements` (freeform `string[]`) do not have a `checks` option and are not part of this change.

## Acceptance Criteria

- [x] `Check` constant object is exported from `src/index.ts` with `Content`, `Layout`, and `Accessibility` sub-objects
- [x] Derived types `ContentCheckName`, `LayoutCheckName`, `AccessibilityCheckName` are exported as type-only from `src/index.ts`
- [x] `ContentOptions`, `LayoutOptions`, `AccessibilityOptions` interfaces use derived types instead of inline unions
- [x] Template files derive `ALL_CHECKS` and `CHECK_STATEMENTS` typing from `Check` constants (single source of truth)
- [x] JSDoc comments on each constant key describing what the check validates
- [x] Cross-category constants rejected at compile time (e.g., `Check.Layout.OVERLAP` in `ContentOptions.checks`)
- [x] All existing tests pass without modification (except imports if needed)
- [x] New tests in `tests/constants.test.ts` verify check constant values and structure
- [x] `tests/index.test.ts` updated to verify `Check` export
- [x] `pnpm build` succeeds and `.d.ts` output preserves literal types

## MVP

### `src/constants.ts` — add `Check` object and derived types

```typescript
// --- Check name constants (grouped by template) ---

export const Check = {
  Content: {
    /** Detects Lorem ipsum, TODO, TBD, and similar placeholder text */
    PLACEHOLDER_TEXT: "placeholder-text",
    /** Detects error messages, banners, stack traces, or error codes */
    ERROR_MESSAGES: "error-messages",
    /** Detects broken image icons or failed-to-load image indicators */
    BROKEN_IMAGES: "broken-images",
  },
  Layout: {
    /** Detects elements that unintentionally overlap each other */
    OVERLAP: "overlap",
    /** Detects content cut off or extending beyond container boundaries */
    OVERFLOW: "overflow",
    /** Detects inconsistent alignment of text, images, and UI components */
    ALIGNMENT: "alignment",
  },
  Accessibility: {
    /** Detects insufficient color contrast between text and backgrounds */
    CONTRAST: "contrast",
    /** Detects text that is cut off, overlapping, too small, or obscured */
    READABILITY: "readability",
    /** Detects interactive elements that are not visually distinct */
    INTERACTIVE_VISIBILITY: "interactive-visibility",
  },
} as const;

// --- Derived check-name union types ---

export type ContentCheckName = (typeof Check.Content)[keyof typeof Check.Content];
export type LayoutCheckName = (typeof Check.Layout)[keyof typeof Check.Layout];
export type AccessibilityCheckName = (typeof Check.Accessibility)[keyof typeof Check.Accessibility];
```

### `src/types.ts` — update option interfaces to use derived types

```typescript
import type { ContentCheckName, LayoutCheckName, AccessibilityCheckName } from "./constants.js";

export interface AccessibilityOptions {
  checks?: AccessibilityCheckName[];
  edgeCaseRules?: readonly string[];
}

export interface LayoutOptions {
  checks?: LayoutCheckName[];
  edgeCaseRules?: readonly string[];
}

export interface ContentOptions {
  checks?: ContentCheckName[];
  edgeCaseRules?: readonly string[];
}
```

### `src/templates/content.ts` — derive from Check constants

```typescript
import type { ContentOptions } from "../types.js";
import { Check, type ContentCheckName } from "../constants.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ALL_CHECKS: ContentCheckName[] = Object.values(Check.Content);

const CONTENT_ROLE =
  "Evaluate this screenshot for content quality problems — placeholder or dummy content, error states, and broken resources that should not appear in a production UI.";

const CHECK_STATEMENTS: Record<ContentCheckName, string> = {
  [Check.Content.PLACEHOLDER_TEXT]:
    "No placeholder text like 'Lorem ipsum', 'TODO', 'TBD', 'placeholder', or similar dummy content is visible on the page",
  [Check.Content.ERROR_MESSAGES]:
    "No error messages, error banners, stack traces, or error codes are visible on the page",
  [Check.Content.BROKEN_IMAGES]:
    "No broken image icons, missing image placeholders, or failed-to-load image indicators are visible",
};

export function buildContentPrompt(options?: ContentOptions): string {
  const checks = options?.checks ?? [...ALL_CHECKS];
  const statements = checks.map((c) => CHECK_STATEMENTS[c]);

  return buildCheckPrompt(statements, {
    role: CONTENT_ROLE,
    edgeCaseRules: options?.edgeCaseRules,
  });
}
```

### `src/templates/layout.ts` — derive from Check constants

```typescript
import type { LayoutOptions } from "../types.js";
import { Check, type LayoutCheckName } from "../constants.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ALL_CHECKS: LayoutCheckName[] = Object.values(Check.Layout);

const LAYOUT_ROLE =
  "Evaluate this screenshot for visual layout problems — overlapping elements, content that appears cut off or overflowing, and inconsistent alignment patterns.";

const LAYOUT_EDGE_RULES: readonly string[] = [
  "Intentional overlaps (stacked avatars, dropdown menus, overlapping cards) are acceptable. Flag only overlaps that obscure content or appear broken.",
  "Scrollable containers with partially visible content are not overflow issues.",
];

const CHECK_STATEMENTS: Record<LayoutCheckName, string> = {
  [Check.Layout.OVERLAP]:
    "No elements overlap each other unintentionally — all content is clearly separated and readable",
  [Check.Layout.OVERFLOW]:
    "No content appears to be unintentionally cut off or extending beyond its container boundaries",
  [Check.Layout.ALIGNMENT]:
    "Elements are properly aligned — text, images, and UI components follow a consistent grid or alignment pattern",
};

export function buildLayoutPrompt(options?: LayoutOptions): string {
  const checks = options?.checks ?? [...ALL_CHECKS];
  const statements = checks.map((c) => CHECK_STATEMENTS[c]);

  const edgeRules = options?.edgeCaseRules
    ? [...LAYOUT_EDGE_RULES, ...options.edgeCaseRules]
    : LAYOUT_EDGE_RULES;

  return buildCheckPrompt(statements, { role: LAYOUT_ROLE, edgeCaseRules: edgeRules });
}
```

### `src/templates/accessibility.ts` — derive from Check constants

```typescript
import type { AccessibilityOptions } from "../types.js";
import { Check, type AccessibilityCheckName } from "../constants.js";
import { buildCheckPrompt } from "../core/prompt.js";

const ALL_CHECKS: AccessibilityCheckName[] = Object.values(Check.Accessibility);

const ACCESSIBILITY_ROLE =
  "Evaluate this screenshot for visual accessibility. Focus on what you can actually perceive — apparent contrast levels, text legibility, and visual distinctiveness of interactive elements.";

const ACCESSIBILITY_EDGE_RULES: readonly string[] = [
  "Do not state specific contrast ratios. Describe contrast as 'appears sufficient' or 'appears low'.",
  "Dark mode and light mode themes are both valid. Do not flag a valid dark theme as a contrast issue.",
];

const CHECK_STATEMENTS: Record<AccessibilityCheckName, string> = {
  [Check.Accessibility.CONTRAST]:
    "All text and interactive elements appear to have sufficient color contrast — text is clearly readable against its background",
  [Check.Accessibility.READABILITY]:
    "All text is readable — no text is cut off, overlapping, too small to read, or obscured by background images",
  [Check.Accessibility.INTERACTIVE_VISIBILITY]:
    "All interactive elements (buttons, links, inputs) are clearly identifiable and visually distinct from non-interactive content",
};

export function buildAccessibilityPrompt(options?: AccessibilityOptions): string {
  const checks = options?.checks ?? [...ALL_CHECKS];
  const statements = checks.map((c) => CHECK_STATEMENTS[c]);

  const edgeRules = options?.edgeCaseRules
    ? [...ACCESSIBILITY_EDGE_RULES, ...options.edgeCaseRules]
    : ACCESSIBILITY_EDGE_RULES;

  return buildCheckPrompt(statements, {
    role: ACCESSIBILITY_ROLE,
    edgeCaseRules: edgeRules,
  });
}
```

### `src/index.ts` — add Check export and derived type exports

```typescript
// Constants
export { Provider, Model, Check, DEFAULT_MODELS, VALID_PROVIDERS } from "./constants.js";
export type {
  KnownModelName,
  ContentCheckName,
  LayoutCheckName,
  AccessibilityCheckName,
} from "./constants.js";
```

### `tests/constants.test.ts` — add Check constant tests

```typescript
describe("Check", () => {
  it("has correct Content check values", () => {
    expect(Check.Content.PLACEHOLDER_TEXT).toBe("placeholder-text");
    expect(Check.Content.ERROR_MESSAGES).toBe("error-messages");
    expect(Check.Content.BROKEN_IMAGES).toBe("broken-images");
  });

  it("has correct Layout check values", () => {
    expect(Check.Layout.OVERLAP).toBe("overlap");
    expect(Check.Layout.OVERFLOW).toBe("overflow");
    expect(Check.Layout.ALIGNMENT).toBe("alignment");
  });

  it("has correct Accessibility check values", () => {
    expect(Check.Accessibility.CONTRAST).toBe("contrast");
    expect(Check.Accessibility.READABILITY).toBe("readability");
    expect(Check.Accessibility.INTERACTIVE_VISIBILITY).toBe("interactive-visibility");
  });

  it("has exactly 3 checks per category", () => {
    expect(Object.keys(Check.Content)).toHaveLength(3);
    expect(Object.keys(Check.Layout)).toHaveLength(3);
    expect(Object.keys(Check.Accessibility)).toHaveLength(3);
  });

  it("has no duplicate check values across categories", () => {
    const allChecks = [
      ...Object.values(Check.Content),
      ...Object.values(Check.Layout),
      ...Object.values(Check.Accessibility),
    ];
    expect(new Set(allChecks).size).toBe(allChecks.length);
  });
});
```

### `tests/index.test.ts` — add Check export verification

```typescript
it("exports Check constants", () => {
  expect(mod.Check).toBeDefined();
  expect(mod.Check.Content.PLACEHOLDER_TEXT).toBe("placeholder-text");
  expect(mod.Check.Layout.OVERLAP).toBe("overlap");
  expect(mod.Check.Accessibility.CONTRAST).toBe("contrast");
});
```

## Files to Modify

| File                             | Change                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/constants.ts`               | Add `Check` object, `ContentCheckName`, `LayoutCheckName`, `AccessibilityCheckName` types                |
| `src/types.ts`                   | Import derived types, replace inline unions in `ContentOptions`, `LayoutOptions`, `AccessibilityOptions` |
| `src/templates/content.ts`       | Import `Check` and `ContentCheckName`, derive `ALL_CHECKS` and `CHECK_STATEMENTS` from them              |
| `src/templates/layout.ts`        | Import `Check` and `LayoutCheckName`, derive `ALL_CHECKS` and `CHECK_STATEMENTS` from them               |
| `src/templates/accessibility.ts` | Import `Check` and `AccessibilityCheckName`, derive `ALL_CHECKS` and `CHECK_STATEMENTS` from them        |
| `src/index.ts`                   | Export `Check` and derived type names                                                                    |
| `tests/constants.test.ts`        | Add `Check` value and structure tests                                                                    |
| `tests/index.test.ts`            | Add `Check` export verification                                                                          |

## References

- Existing pattern: [constants.ts](src/constants.ts) — `Provider`/`Model` `as const` objects
- Institutional learning: [consolidate-magic-strings-with-as-const-satisfies.md](docs/solutions/best-practices/consolidate-magic-strings-with-as-const-satisfies.md)
- Option interfaces: [types.ts:157-175](src/types.ts#L157-L175)
- Template checks: [content.ts:4](src/templates/content.ts#L4), [layout.ts:4](src/templates/layout.ts#L4), [accessibility.ts:4](src/templates/accessibility.ts#L4)
