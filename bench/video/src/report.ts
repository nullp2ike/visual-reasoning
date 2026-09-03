import type { Bug } from "./schema.js";
import type { VideoRunRecord } from "./types.js";

function fmtSeconds(value: number): string {
  return `${value.toFixed(1)}s`;
}

function fmtCost(value: number | undefined): string {
  return value === undefined ? "n/a" : `$${value.toFixed(4)}`;
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
}

function severityCounts(bugs: readonly Bug[]): string {
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const bug of bugs) counts[bug.severity] += 1;
  return `${counts.critical} / ${counts.major} / ${counts.minor}`;
}

function runLabel(record: VideoRunRecord): string {
  const extras: string[] = [];
  if (record.mode === "native") {
    extras.push(`fps ${record.settings.fps}`);
    if (record.settings.resolution && record.settings.resolution !== "default") {
      extras.push(`${record.settings.resolution}-res`);
    }
  } else {
    extras.push(`fps ${record.settings.fps}`, `≤${record.settings.maxFrames ?? "?"} frames`);
  }
  extras.push(record.settings.reasoningEffort);
  return `${record.model} · ${record.mode} (${extras.join(", ")})`;
}

function renderBugTable(bugs: readonly Bug[]): string {
  if (bugs.length === 0) return "_No bugs reported._\n";
  const rows = bugs.map((bug, index) =>
    [
      String(index + 1),
      bug.endTimeSeconds === null
        ? fmtSeconds(bug.startTimeSeconds)
        : `${fmtSeconds(bug.startTimeSeconds)}–${fmtSeconds(bug.endTimeSeconds)}`,
      bug.severity,
      bug.category,
      cell(bug.title),
      cell(bug.screen),
      bug.confidence,
    ].join(" | "),
  );
  return [
    "| # | When | Severity | Category | Bug | Screen | Confidence |",
    "| - | - | - | - | - | - | - |",
    ...rows.map((row) => `| ${row} |`),
    "",
  ].join("\n");
}

function renderBugDetails(bugs: readonly Bug[]): string {
  return bugs
    .map((bug, index) =>
      [
        `#### ${index + 1}. ${bug.title}`,
        "",
        `- **When:** ${fmtSeconds(bug.startTimeSeconds)}${bug.endTimeSeconds === null ? " onward" : ` to ${fmtSeconds(bug.endTimeSeconds)}`}`,
        `- **Severity / category / confidence:** ${bug.severity} / ${bug.category} / ${bug.confidence}`,
        bug.screen ? `- **Screen:** ${bug.screen}` : "",
        `- **Observed:** ${bug.observed}`,
        `- **Expected:** ${bug.expected}`,
        bug.evidence ? `- **Evidence:** ${bug.evidence}` : "",
        "",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    )
    .join("\n\n");
}

function renderRecord(record: VideoRunRecord): string {
  const lines: string[] = [`### ${runLabel(record)} — rep ${record.rep}`, ""];
  if (record.status === "error" || !record.report) {
    lines.push(`**Failed:** ${record.error ?? "unknown error"}`, "");
    return lines.join("\n");
  }
  const { report, usage } = record;
  lines.push(
    `**Summary:** ${report.summary}`,
    "",
    report.userFlow ? `**User flow:** ${report.userFlow}\n` : "",
    `**Bugs found:** ${report.bugs.length} (critical / major / minor: ${severityCounts(report.bugs)})`,
    "",
    renderBugTable(report.bugs),
    renderBugDetails(report.bugs),
  );
  if (usage) {
    const modality = usage.inputTokensByModality
      ? ` (${Object.entries(usage.inputTokensByModality)
          .map(([k, v]) => `${k.toLowerCase()} ${v}`)
          .join(", ")})`
      : "";
    lines.push(
      `_Tokens: ${usage.inputTokens} in${modality}, ${usage.outputTokens} out` +
        (usage.reasoningTokens !== undefined ? ` (${usage.reasoningTokens} thinking)` : "") +
        `; cost ${fmtCost(usage.estimatedCost)}; ${record.durationSeconds.toFixed(1)} s wall time` +
        (record.settings.delivery ? `; delivery ${record.settings.delivery}` : "") +
        "._",
      "",
    );
  }
  return lines.join("\n");
}

export interface ReportInput {
  readonly records: readonly VideoRunRecord[];
  /** Ground-truth notes (from the `<video>.expected.md` sidecar), if any. */
  readonly expected?: string;
}

export function renderReport({ records, expected }: ReportInput): string {
  const first = records[0];
  if (!first) return "# Video bug report\n\n_No runs._\n";
  const lines: string[] = [
    `# Video bug report: ${first.video.filename}`,
    "",
    `- **Video:** \`${first.video.path}\` (${(first.video.bytes / 1024 / 1024).toFixed(2)} MB, ${fmtSeconds(first.video.durationSeconds)}, ${first.video.mimeType})`,
    `- **Prompt variant:** ${first.prompt.variant}` +
      (first.prompt.context ? ` (with context)` : "") +
      ` · sha256 ${first.prompt.hash.slice(0, 12)}…`,
    `- **Run id:** ${first.runId}`,
    "",
    "## Overview",
    "",
    "| Run | Rep | Status | Bugs | crit / major / minor | Tokens in / out | Cost | Wall time |",
    "| - | - | - | - | - | - | - | - |",
    ...records.map((record) => {
      const bugs = record.report?.bugs ?? [];
      return `| ${cell(runLabel(record))} | ${record.rep} | ${record.status} | ${record.report ? bugs.length : "-"} | ${record.report ? severityCounts(bugs) : "-"} | ${record.usage ? `${record.usage.inputTokens} / ${record.usage.outputTokens}` : "-"} | ${fmtCost(record.usage?.estimatedCost)} | ${record.durationSeconds.toFixed(1)} s |`;
    }),
    "",
  ];
  if (expected) {
    lines.push("## Expected (ground truth)", "", expected.trim(), "");
  }
  lines.push("## Runs", "", ...records.map(renderRecord));
  return lines.join("\n");
}
