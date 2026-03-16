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

const CHECK_OUTPUT_SCHEMA = `Respond with a JSON object matching this exact structure:
{
  "pass": boolean,          // true ONLY if ALL statements are true
  "reasoning": string,      // brief overall summary (e.g. "3 of 4 checks passed...")
  "issues": [...],          // list of issues found (empty if all pass)
  "statements": [           // one entry per statement, in order
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
  "reasoning": "1 of 2 checks failed. The submit button is not visible.",
  "issues": [
    { "priority": "major", "category": "missing-element", "description": "Submit button is not visible on the page", "suggestion": "Verify the submit button component is rendered and not hidden by CSS" }
  ],
  "statements": [
    { "statement": "The page header is visible", "pass": true, "reasoning": "Header with logo is clearly visible at the top", "confidence": "high" },
    { "statement": "The submit button is visible", "pass": false, "reasoning": "No submit button found in the visible area of the page", "confidence": "high" }
  ]
}
${JSON_INSTRUCTIONS}`;

const ASK_OUTPUT_SCHEMA = `Respond with a JSON object matching this exact structure:
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

const DEFAULT_ASK_ROLE =
  "You are a visual QA assistant. Analyze the provided image based on the user's request.";

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

  const sections = [options?.role ?? DEFAULT_CHECK_ROLE];

  if (options?.instructions && options.instructions.length > 0) {
    sections.push(buildInstructionsSection(options.instructions));
  }

  sections.push(`Statements to evaluate:\n${statementsBlock}`);
  sections.push(CHECK_OUTPUT_SCHEMA);

  return sections.join("\n\n");
}

export function buildAskPrompt(
  userPrompt: string,
  options?: { readonly instructions?: readonly string[] },
): string {
  const sections = [DEFAULT_ASK_ROLE];

  if (options?.instructions && options.instructions.length > 0) {
    sections.push(buildInstructionsSection(options.instructions));
  }

  sections.push(`User request: ${userPrompt}`);
  sections.push(ASK_OUTPUT_SCHEMA);

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
