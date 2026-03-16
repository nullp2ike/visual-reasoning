# Prompt Improvements Brainstorm

**Date:** 2026-03-05
**Status:** Draft

## What We're Building

Improve the prompt system in visual-ai-assertions to get better, more reliable results from vision models. Three focus areas:

1. **Domain context per template** — Give the model specialized knowledge about what kind of analysis it's performing (accessibility audit, layout review, etc.) instead of the generic "visual QA assistant" role.
2. **Edge case guidance** — Add rules for ambiguous situations so the model behaves consistently when things are borderline.
3. **Stronger compare prompt** — Redesign the weakest prompt for regression testing use cases.

## Why This Approach: Composable Prompt Blocks (Approach C)

Rather than duplicating full prompts per template or adding optional parameters to `buildCheckPrompt`, we'll create **reusable prompt fragments** that compose together:

### Block Types

| Block             | Purpose                           | Example                                                     |
| ----------------- | --------------------------------- | ----------------------------------------------------------- |
| **Role**          | Domain-specific expertise context | "You are auditing this UI for visual accessibility..."      |
| **Edge Rules**    | How to handle ambiguous cases     | "When an element is partially visible, flag it as minor..." |
| **Evaluation**    | The actual statements/criteria    | (existing statement list)                                   |
| **Output Schema** | JSON response format + example    | (existing JSON instructions)                                |

### Composition Pattern

Each template composes its prompt from blocks:

```
[Role Block] + [Edge Rules Block] + [Evaluation Block] + [Output Schema Block]
```

The core `buildCheckPrompt` and `buildQueryPrompt` become thin composers that accept blocks rather than containing all the text inline.

### Token Budget

Balanced approach — each domain block adds ~30-60 tokens. Edge case rules add ~40-80 tokens. Total overhead per call: ~70-140 extra input tokens. Negligible cost impact.

## Key Decisions

1. **Composable blocks over monolithic prompts** — Keeps things DRY, easy to add new templates, and each block can be tested/tuned independently.
2. **Domain context is short and focused** — 2-3 sentences max per role block. Not a full persona, just enough to activate relevant model knowledge.
3. **Edge case rules are domain-specific** — Accessibility has different ambiguity rules than layout or content checks. Each template defines its own edge rules.
4. **Compare prompt is specialized for regression testing** — Primary use case is catching unintended visual changes between a baseline and current screenshot. The prompt should guide the model to categorize changes as intentional vs. unintentional.

## Specific Prompt Improvements

### Domain Role Blocks (new)

**Accessibility:**

> You are a visual accessibility reviewer. Evaluate what you can actually perceive in this screenshot — apparent contrast levels, text legibility, and visual distinctiveness of interactive elements. Do not claim to measure exact contrast ratios; instead assess whether contrast appears sufficient or insufficient.

**Layout:**

> You are a UI layout reviewer. Look for visual layout problems like overlapping elements, content that appears cut off or overflowing, and inconsistent alignment patterns.

**Content:**

> You are a content quality reviewer. Look for placeholder or dummy content, error states, and broken resources that should not appear in a production UI.

**Page Load:**

> You are evaluating whether this page has finished loading. Look for loading indicators, empty content areas, and missing resources.

**Missing Elements:**

> You are checking whether specific UI elements are present and visible in this screenshot.

### Edge Case Rules (new)

**General rules (shared across templates):**

- If an element is partially visible (cut off by screenshot boundary), treat it as visible but note the partial visibility.
- If something is ambiguous, flag it as a minor issue rather than passing or failing definitively.
- Only evaluate what is visible in the screenshot — do not speculate about content outside the visible area.

**Accessibility-specific:**

- Do not state specific contrast ratios. Instead use language like "appears to have low contrast" or "contrast appears sufficient."
- Consider that dark mode / light mode themes may both be valid. Do not flag a valid dark theme as a contrast issue.

**Layout-specific:**

- Intentional overlaps (e.g., overlapping cards, stacked avatars, dropdown menus) are acceptable. Flag only overlaps that obscure content or appear broken.
- Scrollable containers with partially visible content are not overflow issues.

**Compare-specific:**

- Assume the BEFORE image is the baseline/expected state.
- Categorize each change as: structural (layout/element changes), stylistic (color/font/spacing), content (text/image changes), or removal (elements gone).
- Flag removals and structural changes as higher priority; stylistic changes as lower priority unless they break readability.

### Compare Prompt Redesign

Current compare prompt is generic. Redesigned version for regression testing:

**New structure:**

1. Role: "You are performing a visual regression test..."
2. Instructions: Compare BEFORE (baseline) and AFTER (current), looking for unintended changes
3. Change categorization: structural / stylistic / content / removal
4. Output schema: Enhanced to include change categories and a `changes` array alongside `issues`

**Key improvement:** Separate "changes detected" from "issues flagged." A change isn't necessarily an issue — the model should report all changes and flag only the problematic ones.

### Statement Rewording

Some existing statements should be reworded:

| Current                                                  | Improved                                                                                                              | Reason                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| "...sufficient color contrast (at least 4.5:1 ratio...)" | "...sufficient color contrast — text should be clearly readable against its background"                               | Models can't compute ratios                   |
| "No content overflows...beyond the visible viewport"     | "No content appears to be unintentionally cut off or extending beyond its container boundaries"                       | Distinguish overflow from screenshot edge     |
| "The page appears fully loaded — no loading spinners..." | "The page content has finished loading — no spinning indicators, skeleton placeholders, or progress bars are visible" | More specific about what "loading" looks like |

## Resolved Questions

1. **Compare prompt mode parameter?** **YAGNI.** Build for regression testing only. Add modes later if the need arises.

2. **Edge case rules user-configurable?** **Yes — allow overrides.** Users can pass custom edge case rules or toggle strictness levels via template options. Ship with good defaults.

3. **Confidence field on statement results?** **Yes — add confidence.** Each statement result will include a `confidence: "high" | "medium" | "low"` field alongside the boolean `pass`. This helps users distinguish "definitely wrong" from "might be wrong." Requires updating the Zod response schema and the output schema prompt block.

## Open Questions

None remaining.
