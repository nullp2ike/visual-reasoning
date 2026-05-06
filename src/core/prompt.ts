const JSON_INSTRUCTIONS = `
IMPORTANT: You MUST respond with valid JSON only. No markdown, no code blocks, no extra text.
`;

const ISSUE_SCHEMA_INSTRUCTIONS = `
Each issue must have:
- "priority": "critical" | "major" | "minor"
- "category": "accessibility" | "missing-element" | "layout" | "content" | "styling" | "functionality" | "performance" | "other"
- "description": what the issue is
- "suggestion": how to fix or improve it
`;

const CHECK_OUTPUT_SCHEMA_IMAGE = `IMPORTANT: Follow this evaluation order:
1. First, evaluate EACH statement independently and populate the "statements" array
2. Then, set "pass" to true ONLY if every statement passed (logical AND of all statement results)
3. Write "reasoning" as a brief overall summary of the evaluation
4. Include "issues" only for statements that failed

Respond with a JSON object matching this exact structure:
{
  "pass": boolean,          // true ONLY if ALL statements passed — derive from statements array
  "reasoning": string,      // brief overall summary of the evaluation
  "issues": [...],          // one issue per failing statement (empty if all pass)
  "statements": [           // one entry per statement, in order — evaluate these FIRST
    {
      "statement": string,  // the original statement text
      "pass": boolean,      // whether this statement is true
      "reasoning": string,  // explanation for this statement
      "confidence": "high" | "medium" | "low"
        // high = clearly visible/absent with no ambiguity
        // medium = present but partially obscured, small, or borderline
        // low = cannot determine with certainty from the screenshot
    }
  ]
}
${ISSUE_SCHEMA_INSTRUCTIONS}

Only include issues for statements that fail. If all statements pass, issues should be an empty array.

Example for a failing check:
{
  "pass": false,
  "reasoning": "The submit button is not visible on the page.",
  "issues": [
    { "priority": "major", "category": "missing-element", "description": "Submit button is not visible on the page", "suggestion": "Verify the submit button component is rendered and not hidden by CSS" }
  ],
  "statements": [
    { "statement": "The page header is visible", "pass": true, "reasoning": "Header with logo is clearly visible at the top", "confidence": "high" },
    { "statement": "The submit button is visible", "pass": false, "reasoning": "No submit button found in the visible area of the page", "confidence": "high" }
  ]
}
${JSON_INSTRUCTIONS}`;

const CHECK_OUTPUT_SCHEMA_VIDEO = `IMPORTANT: Follow this evaluation order:
1. First, evaluate EACH statement independently across the entire timeline and populate the "statements" array
2. A statement passes if it is true at ANY frame of the timeline, unless the wording explicitly says otherwise (e.g. "throughout", "at all times")
3. For each statement that passes, set "timestampSeconds" to the timestamp of the frame that most clearly demonstrates it (or where it first becomes true). Use null when the statement fails or applies across the whole clip.
4. Then, set "pass" to true ONLY if every statement passed (logical AND of all statement results)
5. Write "reasoning" as a brief overall summary of the evaluation
6. Include "issues" only for statements that failed

Respond with a JSON object matching this exact structure:
{
  "pass": boolean,          // true ONLY if ALL statements passed — derive from statements array
  "reasoning": string,      // brief overall summary of the evaluation
  "issues": [...],          // one issue per failing statement (empty if all pass)
  "statements": [           // one entry per statement, in order — evaluate these FIRST
    {
      "statement": string,  // the original statement text
      "pass": boolean,      // whether this statement is true at any point in the timeline
      "reasoning": string,  // explanation for this statement, citing frame timestamps where relevant
      "confidence": "high" | "medium" | "low",
      "timestampSeconds": number | null
        // seconds from the start of the clip where the statement is most clearly true,
        // or null if it failed / applies across the whole clip
    }
  ]
}
${ISSUE_SCHEMA_INSTRUCTIONS}

Only include issues for statements that fail. If all statements pass, issues should be an empty array.

Example for a passing video check:
{
  "pass": true,
  "reasoning": "The success toast appeared briefly around 3.5s.",
  "issues": [],
  "statements": [
    { "statement": "A success toast with text 'Saved' appears", "pass": true, "reasoning": "A green toast labeled 'Saved' is visible in the bottom-right at the 3.5s frame", "confidence": "high", "timestampSeconds": 3.5 }
  ]
}
${JSON_INSTRUCTIONS}`;

const ASK_OUTPUT_SCHEMA_IMAGE = `Respond with a JSON object matching this exact structure:
{
  "summary": string,        // high-level analysis summary
  "issues": [...]           // list of issues/findings, can be empty
}
${ISSUE_SCHEMA_INSTRUCTIONS}

Prioritize issues by severity:
- "critical": blocks functionality, breaks accessibility, data loss risk
- "major": significant usability or visual problem
- "minor": cosmetic issue, minor improvement suggestion

Example:
{
  "summary": "Found 2 issues: a critical accessibility problem and a minor cosmetic issue.",
  "issues": [
    { "priority": "critical", "category": "accessibility", "description": "Submit button has insufficient color contrast", "suggestion": "Increase contrast so text is clearly readable against the background" },
    { "priority": "minor", "category": "content", "description": "Placeholder text 'Lorem ipsum' visible in sidebar", "suggestion": "Replace with actual content or remove the placeholder section" }
  ]
}
${JSON_INSTRUCTIONS}`;

const ASK_OUTPUT_SCHEMA_VIDEO = `Respond with a JSON object matching this exact structure:
{
  "summary": string,            // high-level summary of what happens across the timeline
  "issues": [...],              // list of issues/findings, can be empty
  "frameReferences": number[]   // 0-based indices of frames the answer relies on (in order)
}
${ISSUE_SCHEMA_INSTRUCTIONS}

Prioritize issues by severity (critical / major / minor) as for image input.
Cite frame indices in "frameReferences" so the user can locate the moments you describe.
${JSON_INSTRUCTIONS}`;

const COMPARE_OUTPUT_SCHEMA = `Respond with a JSON object matching this exact structure:
{
  "pass": boolean,          // true if no critical or major changes found
  "reasoning": string,      // overall summary of changes detected
  "changes": [              // list of all visual differences detected (empty if images are identical)
    {
      "description": string,  // what changed between the images
      "severity": "critical" | "major" | "minor"
        // critical = element removed, layout broken, functionality lost
        // major = significant visual change that may be unintentional
        // minor = small stylistic difference (color, spacing, font)
    }
  ]
}

If the images appear identical, set pass to true, explain in reasoning, and return an empty changes array.
${JSON_INSTRUCTIONS}`;

const DEFAULT_CHECK_ROLE =
  "You are a visual QA assistant. Evaluate the provided image precisely and objectively.";

const DEFAULT_CHECK_ROLE_VIDEO =
  "You are a visual QA assistant. Evaluate the provided sequence of video frames precisely and objectively, treating them as a chronological timeline.";

const DEFAULT_ASK_ROLE =
  "You are a visual QA assistant. Analyze the provided image based on the user's request.";

const DEFAULT_ASK_ROLE_VIDEO =
  "You are a visual QA assistant. Analyze the provided sequence of video frames as a chronological timeline based on the user's request.";

/**
 * Describes the media accompanying a prompt so the builders can adapt the
 * role, schema, and timeline guidance accordingly.
 */
export type MediaContext =
  | { kind: "image" }
  | { kind: "video"; frameTimestamps: readonly number[]; durationSeconds: number };

function buildVideoTimelineSection(
  frameTimestamps: readonly number[],
  durationSeconds: number,
): string {
  const formatted = frameTimestamps.map((t, i) => `  ${i}: ${t.toFixed(2)}s`).join("\n");
  return `Video timeline:
- Total duration: ${durationSeconds.toFixed(2)}s
- ${frameTimestamps.length} frames sampled (in chronological order)
- Frame index → timestamp:
${formatted}

Treat the attached images as a chronological timeline. The first image is the earliest frame, the last is the latest. Refer to frames by timestamp where helpful.`;
}

const COMPARE_ROLE =
  "You are performing a visual regression test. Compare the BEFORE image (baseline) to the AFTER image (current) and identify all visual differences. Flag changes that appear unintentional or problematic.";

const COMPARE_EDGE_RULES: readonly string[] = [
  "The BEFORE image is the baseline/expected state.",
  "Flag removals and layout changes as higher severity. Color and spacing changes are lower severity unless they break readability.",
  "If the images appear identical, report no changes and pass.",
];

export interface CheckPromptOptions {
  readonly role?: string;
  readonly instructions?: readonly string[];
  readonly media?: MediaContext;
}

export interface AskPromptOptions {
  readonly instructions?: readonly string[];
  readonly media?: MediaContext;
}

export interface ComparePromptOptions {
  readonly userPrompt?: string;
  readonly instructions?: readonly string[];
}

function buildInstructionsSection(instructions: readonly string[]): string {
  return (
    "Additional instructions:\n" + instructions.map((instruction) => `- ${instruction}`).join("\n")
  );
}

export function buildCheckPrompt(
  statements: string | string[],
  options?: CheckPromptOptions,
): string {
  const stmts = Array.isArray(statements) ? statements : [statements];
  const statementsBlock = stmts.map((s, i) => `${i + 1}. "${s}"`).join("\n");
  const media = options?.media;
  const defaultRole = media?.kind === "video" ? DEFAULT_CHECK_ROLE_VIDEO : DEFAULT_CHECK_ROLE;

  const sections = [options?.role ?? defaultRole];

  if (media?.kind === "video") {
    sections.push(buildVideoTimelineSection(media.frameTimestamps, media.durationSeconds));
  }

  if (options?.instructions && options.instructions.length > 0) {
    sections.push(buildInstructionsSection(options.instructions));
  }

  sections.push(`Statements to evaluate:\n${statementsBlock}`);
  sections.push(media?.kind === "video" ? CHECK_OUTPUT_SCHEMA_VIDEO : CHECK_OUTPUT_SCHEMA_IMAGE);

  return sections.join("\n\n");
}

export function buildAskPrompt(userPrompt: string, options?: AskPromptOptions): string {
  const media = options?.media;
  const sections = [media?.kind === "video" ? DEFAULT_ASK_ROLE_VIDEO : DEFAULT_ASK_ROLE];

  if (media?.kind === "video") {
    sections.push(buildVideoTimelineSection(media.frameTimestamps, media.durationSeconds));
  }

  if (options?.instructions && options.instructions.length > 0) {
    sections.push(buildInstructionsSection(options.instructions));
  }

  sections.push(`User request: ${userPrompt}`);
  sections.push(media?.kind === "video" ? ASK_OUTPUT_SCHEMA_VIDEO : ASK_OUTPUT_SCHEMA_IMAGE);

  return sections.join("\n\n");
}

export function buildAiDiffPrompt(): string {
  return `You are given two screenshots of the same page or component.
Generate a single annotated image that clearly highlights the visual differences between the first and second images.
- Overlay semi-transparent red rectangles or outlines on areas that changed
- Keep unchanged areas visible but slightly dimmed
- The output image should match the dimensions of the input images
- Focus on meaningful visual differences: layout shifts, missing elements, color changes, text differences`;
}

export function buildAiDiffCodeExecutionPrompt(): string {
  return `${buildAiDiffPrompt()}

Write Python code using PIL/Pillow for image processing and matplotlib for rendering to accomplish the above.
Your code MUST load both input images and display the result using matplotlib.`;
}

export function buildComparePrompt(options?: ComparePromptOptions): string {
  const evaluation = options?.userPrompt
    ? `User request: ${options.userPrompt}`
    : "Identify all visual differences between the baseline and current screenshot. Flag any changes that appear unintentional or problematic.";

  const instructions = options?.instructions
    ? [...COMPARE_EDGE_RULES, ...options.instructions]
    : COMPARE_EDGE_RULES;

  const sections = [
    COMPARE_ROLE,
    buildInstructionsSection(instructions),
    evaluation,
    COMPARE_OUTPUT_SCHEMA,
  ];

  return sections.join("\n\n");
}
