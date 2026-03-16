# Prompt Engineering Best Practices for Vision/Multimodal LLMs (2024-2026)

Research compiled: March 2026

---

## 1. Structured Output Prompting

### The Landscape: Three Tiers of Reliability

There are now three distinct approaches to getting JSON from vision models, ranked by reliability:

**Tier 1: Native Structured Outputs (highest reliability)**

- **OpenAI**: `response_format: { type: "json_schema", json_schema: {...} }` in Chat Completions, or `text.format.type: "json_schema"` in the newer Responses API. Works with vision inputs. Schema is enforced at the token generation level -- the model literally cannot produce invalid JSON.
- **Anthropic**: Public beta via `output_config.format` with `zodOutputFormat()` helper. Works with Claude Sonnet 4.5, Opus 4.1, and Opus 4.6. Requires beta header `anthropic-beta: structured-outputs-2025-11-13`. Supports Zod schemas natively in the TypeScript SDK.
- **Google Gemini**: `response_mime_type: "application/json"` with `response_schema`. Full JSON Schema support including `$ref` and `prefixItems`. Works with all multimodal inputs (images, video, audio).

**Tier 2: JSON Mode (medium reliability)**

- Model is constrained to produce valid JSON but not to match a specific schema.
- OpenAI: `response_format: { type: "json_object" }`.
- Useful when you want flexibility but still need parseable output.

**Tier 3: Prompt-Based JSON (lowest reliability, widest compatibility)**

- Include schema in the prompt text and ask the model to respond with JSON.
- This is what the current `visual-reasoning` codebase uses.
- Requires post-hoc validation (Zod parsing) and retry logic.

### Actionable Recommendations for This Project

1. **Migrate to native structured outputs per provider.** Each provider driver should use its native structured output mechanism. This eliminates JSON parse failures entirely.

2. **Keep prompt-based JSON as the fallback.** For models/providers that do not support structured outputs, the current approach (schema in prompt + Zod validation) is correct. The "IMPORTANT: You MUST respond with valid JSON only" instruction is industry standard.

3. **Schema-first beats example-first.** Research shows that providing a JSON schema definition is more reliable than providing examples alone. However, combining both (schema definition + one example) produces the best results. The current codebase already does this well.

4. **Keep schemas flat and use enums aggressively.** Constrain enum values (like `priority` and `category`) at the schema level, not just in the prompt text. With native structured outputs, these become hard constraints.

5. **Descriptions on schema fields matter.** When using native structured outputs, the model reads `description` fields in the schema. Add semantic meaning there:
   ```typescript
   const IssueSchema = z.object({
     priority: z
       .enum(["critical", "major", "minor"])
       .describe(
         "critical: blocks functionality or accessibility. major: significant usability problem. minor: cosmetic issue.",
       ),
   });
   ```

### Provider-Specific Implementation Notes

**OpenAI (Responses API):**

```typescript
const response = await openai.responses.create({
  model: "gpt-4o",
  input: [{ role: "user", content: [imageContent, textContent] }],
  text: {
    format: {
      type: "json_schema",
      name: "check_result",
      schema: checkResultJsonSchema,
      strict: true,
    },
  },
});
```

**Anthropic (Structured Outputs Beta):**

```typescript
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const response = await client.messages.parse({
  model: "claude-sonnet-4-5-20241022",
  max_tokens: 4096,
  messages: [{ role: "user", content: [imageBlock, textBlock] }],
  output_config: { format: zodOutputFormat(CheckResultSchema) },
});
// response.parsed_output is typed and validated
```

**Google Gemini:**

```typescript
const result = await model.generateContent({
  contents: [{ role: "user", parts: [imagePart, textPart] }],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: checkResultJsonSchema,
  },
});
```

---

## 2. Role/System Prompting for Vision Tasks

### Research Finding: Personas Do NOT Reliably Improve Accuracy

A key 2024 study ("When 'A Helpful Assistant' Is Not Really Helpful", arxiv 2311.10054v3) tested 2,410 factual questions across 4 LLM families and found:

- **Adding personas in system prompts does not improve model performance** compared to no-persona baselines.
- The effect of each persona is **largely random** -- sometimes helpful, sometimes harmful.
- **Even with GPT-4**, the gap between base prompting and persona prompting is minimal for accuracy-based tasks.
- Persona prompting helps for **open-ended/creative tasks** but NOT for **classification and factual accuracy** tasks.

### What DOES Help for Vision Tasks

Instead of generic role personas ("You are an accessibility expert"), research suggests these alternatives are more effective:

1. **Task-specific behavioral instructions** rather than identity claims:
   - BAD: "You are an expert QA engineer with 20 years of experience"
   - GOOD: "Evaluate each visual element against WCAG AA contrast requirements. Report the approximate contrast ratio when possible."

2. **Domain knowledge injection**: Instead of hoping a persona activates latent knowledge, directly inject the relevant criteria:
   - BAD: "You are an accessibility reviewer"
   - GOOD: "Check these specific WCAG AA criteria: text contrast >= 4.5:1, large text >= 3:1, interactive elements must be visually distinguishable"

3. **Output behavior framing**: Brief framing that shapes output format and thoroughness:
   - GOOD: "You are a visual QA assistant. Be precise and objective." (what the codebase currently uses -- this is fine)
   - This works not because of the persona but because it sets expectations for tone and thoroughness.

### Recommendation for This Project

The current prompt approach in `src/core/prompt.ts` is already well-aligned with best practices:

- "You are a visual QA assistant" is a minimal framing (acceptable).
- The real work is done by specific behavioral instructions ("Evaluate each of the following statements", "Be precise and objective").
- The templates inject domain-specific criteria directly (WCAG ratios, specific layout checks).

**Do not invest time in elaborate persona engineering.** Instead, invest in more specific evaluation criteria within templates.

---

## 3. Confidence Calibration

### The Core Problem

LLMs are systematically overconfident when self-reporting confidence. Instruction-tuned models are trained to sound assured, which directly conflicts with calibration. Key findings from 2025 research:

- Raw verbalized confidence scores are **poorly calibrated**, with Expected Calibration Error (ECE) often exceeding 40%.
- Models express **similar confidence levels for correct and incorrect answers**, making raw confidence scores unreliable for distinguishing right from wrong.
- Better-performing models show somewhat better calibration, but the gap is still large.

### Techniques That Improve Calibration

**1. SteerConf (NeurIPS 2025)** -- Most promising approach for production use.

- Ask the model the same question multiple times with different "steering" prompts (conservative, neutral, optimistic).
- Measure consistency across steered responses.
- Aggregate scores using consistency weighting.
- Reduces ECE from ~42% to ~21% on GPT-3.5 (and better on GPT-4).
- No fine-tuning required.

**2. Multi-sample consistency** -- Simpler version of SteerConf.

- Ask the model the same question N times (e.g., 3-5) with temperature > 0.
- If it gives the same answer every time, confidence is higher.
- If answers vary, confidence is lower.
- Trade-off: costs N times more per evaluation.

**3. Critique-based calibration**

- After getting an initial answer, ask the model to critique its own response.
- Use the critique to adjust the confidence score.
- Helps with over-confidence but adds latency.

**4. Calibrated confidence prompting** (practical for this project)

- Instead of asking for a raw 0-100 score, use anchored scales:

```
Rate your confidence using these specific anchors:
- 95-100: I can clearly see the element/issue with no ambiguity
- 80-94: I'm fairly certain but there's some visual ambiguity (e.g., similar colors, small elements)
- 60-79: I see something that might match but I'm not sure
- Below 60: I cannot clearly determine this from the image
```

### Recommendation for This Project

1. **Do NOT add a raw `confidence: number` field** to the response schema without calibration. It will be misleadingly high and provide false assurance.

2. **If confidence is needed**, use the anchored scale approach above. It is cheap (one call) and more interpretable than a bare number.

3. **For high-stakes checks**, consider the multi-sample consistency approach: run the check 3 times and report agreement as the confidence signal. This is more reliable than self-reported confidence.

4. **The `reasoning` field already serves as implicit confidence.** When the model says "No submit button found in the visible area" vs "There appears to be something that might be a button in the lower right", the language itself signals confidence. Consider parsing reasoning strength rather than adding a numeric field.

---

## 4. Edge Case Instructions

### Research Finding: Explicit Rules Help, But With Diminishing Returns

The consensus from 2025 prompt engineering guides (Palantir, Lakera, DigitalOcean):

**Rules DO help when:**

- They address **specific, common failure modes** you have observed.
- They are **few in number** (3-5 rules maximum).
- They include **concrete examples** of the edge case.
- They are **positioned close to the relevant part** of the prompt.

**Rules HURT when:**

- There are **too many** (>7-10 rules). Models start ignoring or confusing them.
- They are **abstract or vague** ("handle all edge cases appropriately").
- They **contradict each other** or the main instruction.
- They are **front-loaded** before the main task description.

### Best Practice: Iterative Edge Case Integration

The recommended process:

1. Start with the core task description (what the codebase currently has).
2. Run the prompt against a test suite of diverse inputs.
3. Identify specific failure patterns (e.g., "model reports false positive when page has loading spinner").
4. Add a targeted rule for THAT specific failure.
5. Re-run the test suite to verify the rule helps without causing regressions.
6. Repeat.

### Concrete Pattern for This Project

Instead of generic edge case rules, use **conditional instructions tied to specific visual patterns**:

```
IMPORTANT edge case rules:
1. If the page appears to be in a loading state (spinner, skeleton screen, progress bar),
   report elements as "not yet loaded" rather than "missing".
2. If an element exists but is partially obscured (e.g., behind a modal or dropdown),
   report it as present but note the obstruction.
3. Do not report dark mode / light mode styling differences as issues
   unless specifically asked to check for a particular theme.
```

### Recommendation

- The current prompts are clean and focused. Do not pre-emptively add edge case rules.
- Instead, build a test suite of edge-case screenshots (loading states, modals, dark mode, etc.) and add rules only when specific failures are observed.
- Keep edge case rules in the template files (`src/templates/*.ts`), not in the core prompt builder, so they are domain-specific.

---

## 5. Visual Regression Testing with AI

### How the Industry Leaders Work

**Applitools Eyes (commercial, closed-source)**

- Uses a proprietary Visual AI engine trained on 1+ billion images.
- Does NOT use LLM prompting -- uses specialized computer vision models (CNNs, deep learning).
- Key innovation: classifies changes as "layout", "content", "color", "style" and lets users set thresholds per category.
- Claims 99.9999% accuracy by combining hundreds of specialized algorithms.
- Approach: pixel comparison + structural analysis + ML classification of change significance.

**Percy (BrowserStack, commercial)**

- Primarily pixel-diffing with smart anti-aliasing and rendering-difference filtering.
- Has added "smart diff" features that ignore expected dynamic content.
- Not LLM-based.

**Chromatic (Storybook ecosystem)**

- Compares component screenshots at the Storybook story level.
- Uses pixel-diffing with configurable thresholds.
- AI features focus on ignoring anti-aliasing and sub-pixel rendering differences.
- Not LLM-based.

### Key Insight: The Industry is NOT Using LLM Prompting for Visual Regression

The major commercial tools use specialized CV models, not general-purpose LLMs. This is because:

- Pixel-level precision matters for regression detection.
- LLMs add cost and latency per comparison.
- Specialized models can be faster and more deterministic.

### Where LLMs Add Value (and where this project fits)

LLM-based visual testing fills a different niche than pixel-diffing:

1. **Semantic understanding**: "Is the checkout flow complete?" vs "Did pixel (342, 891) change?"
2. **Natural language assertions**: "The login form should have email and password fields" -- no CSS selectors needed.
3. **Cross-browser/device tolerance**: LLMs naturally handle rendering differences that break pixel-diffing.
4. **Accessibility auditing**: Understanding if content is readable, interactive elements are distinguishable.
5. **Exploratory QA**: "What looks wrong with this page?" -- open-ended analysis.

### Open Source Tools Using LLMs for Visual Testing

**Midscene.js** (10k+ GitHub stars)

- Vision-driven UI automation framework.
- Uses multimodal models (GPT-4o, Gemini, Qwen-VL, UI-TARS) to understand screenshots.
- Users describe actions in natural language: "Click the green button and check that the dialog appears."
- Supports Playwright and Puppeteer integration.
- GitHub: https://github.com/web-infra-dev/midscene

**Key prompt patterns from Midscene.js and similar tools:**

- Screenshot is sent as the primary input (base64 or URL).
- Assertions are expressed as natural language statements.
- The model returns structured JSON with pass/fail + reasoning.
- Coordinate-based element location is used for interaction (the model returns x,y coordinates).

### Recommendations for This Project

1. **Position the library as complementary to pixel-diffing**, not a replacement. The value proposition is semantic assertions, not pixel-level regression.

2. **The `compare()` function** should emphasize semantic change detection: "Did the layout break?" not "Did 0.3% of pixels change?"

3. **Consider adding a `tolerance` or `sensitivity` parameter** that maps to prompt instructions:
   - `strict`: Report any visible difference
   - `moderate`: Report structural/functional differences, ignore cosmetic variations
   - `lenient`: Only report breaking changes (missing elements, broken layout)

4. **Learn from Applitools' category approach**: The current `IssueCategory` enum (accessibility, missing-element, layout, content, styling, functionality, performance, other) is already well-aligned with industry practice.

---

## Summary of Actionable Next Steps

| Priority | Action                                                        | Effort | Impact                              |
| -------- | ------------------------------------------------------------- | ------ | ----------------------------------- |
| HIGH     | Migrate each provider to native structured outputs            | Medium | Eliminates JSON parse failures      |
| HIGH     | Build edge-case test suite (loading, modals, dark mode)       | Medium | Drives targeted prompt improvements |
| MEDIUM   | Add `.describe()` to all Zod schema fields                    | Low    | Improves structured output quality  |
| MEDIUM   | Add sensitivity/tolerance parameter to compare()              | Medium | Better user control                 |
| LOW      | Add anchored confidence scale (if confidence field requested) | Low    | More reliable than raw scores       |
| AVOID    | Elaborate persona/role engineering                            | --     | Research shows minimal benefit      |
| AVOID    | Raw numeric confidence without calibration                    | --     | Misleadingly overconfident          |

---

## Sources

### Structured Outputs

- [OpenAI Structured Outputs Guide](https://platform.openai.com/docs/guides/structured-outputs)
- [Claude Structured Outputs Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Google Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Agenta: Guide to Structured Outputs and Function Calling](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms)
- [MPG ONE: JSON Prompt Guide 2026](https://mpgone.com/json-prompt-guide/)

### Role/Persona Prompting

- [When "A Helpful Assistant" Is Not Really Helpful (arxiv 2311.10054v3)](https://arxiv.org/html/2311.10054v3)
- [PromptHub: Role-Prompting Analysis](https://www.prompthub.us/blog/role-prompting-does-adding-personas-to-your-prompts-really-make-a-difference)
- [Persona is a Double-edged Sword (arxiv 2408.08631)](https://arxiv.org/html/2408.08631v1)

### Confidence Calibration

- [SteerConf: Steering LLMs for Confidence Elicitation (NeurIPS 2025)](https://arxiv.org/abs/2503.02863)
- [Cycles of Thought: Measuring LLM Confidence](https://arxiv.org/html/2406.03441v1)
- [JMIR: Benchmarking LLM Confidence in Clinical Questions](https://medinform.jmir.org/2025/1/e66917)
- [Measuring Confidence in LLM Responses (Medium)](https://medium.com/@georgekar91/measuring-confidence-in-llm-responses-e7df525c283f)

### Edge Case Instructions

- [Palantir: Best Practices for LLM Prompt Engineering](https://www.palantir.com/docs/foundry/aip/best-practices-prompt-engineering)
- [Lakera: Ultimate Guide to Prompt Engineering 2026](https://www.lakera.ai/blog/prompt-engineering-guide)
- [DigitalOcean: Prompt Engineering Best Practices](https://www.digitalocean.com/resources/articles/prompt-engineering-best-practices)
- [Towards Data Science: Design Smarter Prompts](https://towardsdatascience.com/boost-your-llm-outputdesign-smarter-prompts-real-tricks-from-an-ai-engineers-toolbox/)

### Visual Regression Testing

- [Applitools Visual AI](https://applitools.com/platform/validate/visual-ai/)
- [Midscene.js (GitHub)](https://github.com/web-infra-dev/midscene)
- [BrowserStack: Visual Regression Testing Tools](https://www.browserstack.com/guide/visual-regression-testing-open-source)
- [Bug0: Open Source Visual Regression Testing 2026](https://bug0.com/knowledge-base/open-source-visual-regression-testing-tools)
