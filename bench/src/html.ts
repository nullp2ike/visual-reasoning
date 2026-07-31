import type { Manifest, Overrides, Scores } from "./types.js";
import { modelDirName } from "./util.js";

/** One prompt variant's scores, paired with its id, for the in-page toggle. */
export interface VariantScores {
  variant: string;
  scores: Scores;
}

/**
 * Build the self-contained report page. All data is inlined as JSON; the only
 * external references are the dataset screenshots, loaded via `imageBase` —
 * a path relative to the report's own location, which the caller computes from
 * the report directory to the dataset directory (e.g. `../../datasets/<id>`).
 *
 * The client-side computeMatrixCell mirrors bench/src/matrix.ts semantics but
 * uses the page's staged override state so matrix counts update live; the TS
 * version is the tested source of truth.
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildReportHtml(
  variants: readonly VariantScores[],
  manifest: Manifest,
  overrides: Overrides,
  siblingJudges: readonly string[] = [],
  imageBase = "../../datasets/example",
): string {
  if (variants.length === 0) throw new Error("buildReportHtml: at least one variant is required");
  const variantOrder = variants.map((v) => v.variant);
  const scoresByVariant = Object.fromEntries(variants.map((v) => [v.variant, v.scores]));
  const defaultVariant = variantOrder[0] as string;
  // All variants of one report share the same judge; use the default for the
  // build-time hero so prompt + judge are visible even without JavaScript.
  const defaultScores = variants[0]?.scores as Scores;

  const payload = {
    scoresByVariant,
    variantOrder,
    defaultVariant,
    manifest: manifest.entries,
    overrides,
    // Screenshots are not inlined; the page links them relative to its own
    // location so the report stays small and the dataset stays out of it.
    imageBase: imageBase.replace(/\/+$/, ""),
  };
  // </script> inside JSON would terminate the script block early.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");

  const siblingLinksHtml =
    siblingJudges.length > 0
      ? "Other judges: " +
        siblingJudges
          .map(
            (judge) =>
              `<a class="judge-link" href="report.${escapeHtml(modelDirName(judge))}.html">${escapeHtml(judge)}</a>`,
          )
          .join(" · ") +
        ' · <a href="JUDGE_COMPARISON.md">comparison</a>'
      : "";
  // The variant switcher swaps the entire report in-page (matrix, leaderboard,
  // hero) between prompt variants. A single-variant report shows a static badge.
  const variantSwitchHtml =
    variantOrder.length > 1
      ? `<label class="variant-switch">Prompt variant ` +
        `<select id="variant">` +
        variantOrder
          .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
          .join("") +
        `</select></label>`
      : `<span class="variant-badge">Prompt variant: ${escapeHtml(defaultVariant)}</span>`;

  // Leaderboard "compare" checkbox: with >1 variant, show each non-primary
  // variant as a paired row beneath its primary (variantOrder[0]) row.
  const comparisonVariants = variantOrder.slice(1);
  const compareToggleHtml =
    comparisonVariants.length > 0
      ? `<label class="compare-toggle"><input type="checkbox" id="compare-variants"> ` +
        `Compare prompts: pair ${comparisonVariants
          .map((v) => `<code>${escapeHtml(v)}</code>`)
          .join(
            ", ",
          )} as a row beneath each <code>${escapeHtml(defaultVariant)}</code> row (matrix &amp; leaderboard)</label>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Visual reasoning benchmark — judge ${escapeHtml(defaultScores.judgeModel)}</title>
<style>
  :root { --ok: #15803d; --bad: #b91c1c; --muted: #6b7280; --line: #e5e7eb; --accent: #1d4ed8; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #111827; background: #fafafa; }
  main { max-width: 1400px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; } h2 { font-size: 18px; margin-top: 32px; } h3 { font-size: 15px; }
  .prompt-hero { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 14px 18px; margin: 12px 0 8px; }
  .prompt-hero .prompt-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 16px; white-space: pre-wrap; }
  .variant-controls { margin-bottom: 10px; }
  .variant-switch { font-size: 13px; font-weight: 600; color: #3730a3; }
  .variant-switch select { font: inherit; font-weight: 600; margin-left: 6px; padding: 3px 6px; border: 1px solid #c7d2fe; border-radius: 6px; background: #fff; cursor: pointer; }
  .variant-badge { display: inline-block; background: #4338ca; color: #fff; border-radius: 6px; padding: 3px 10px; font-size: 13px; }
  .judge-badge { display: inline-block; background: #1e3a8a; color: #fff; border-radius: 6px; padding: 3px 10px; font-size: 13px; margin-top: 8px; }
  .sibling-links { margin-left: 10px; font-size: 13px; }
  .meta { color: var(--muted); font-size: 12px; margin-bottom: 16px; }
  .meta code { background: #eef2ff; padding: 1px 4px; border-radius: 3px; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: right; white-space: nowrap; }
  th { background: #f3f4f6; user-select: none; position: sticky; top: 0; }
  th:first-child, td:first-child { text-align: left; }
  #leaderboard th { cursor: pointer; }
  #leaderboard tbody tr { cursor: pointer; }
  #leaderboard tbody tr:hover { background: #eff6ff; }
  #leaderboard tbody tr.selected { background: #dbeafe; }
  /* Paired comparison rows: the excluded-prompt row sits tinted under its baseline row. */
  #leaderboard tbody tr.compare-row td { background: #fff7ed; border-top-style: dashed; color: #7c2d12; }
  #leaderboard tbody tr.compare-row:hover td { background: #ffedd5; }
  .row-variant { display: inline-block; font-size: 10px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; border-radius: 3px; padding: 0 5px; margin-right: 6px; vertical-align: 1px; }
  .row-variant.base { background: #e5e7eb; color: #374151; }
  .row-variant.comp { background: #fed7aa; color: #7c2d12; }
  .compare-row .indent { color: var(--muted); margin-right: 2px; }
  .delta { font-size: 11px; font-weight: 600; margin-left: 4px; }
  .delta.good { color: var(--ok); } .delta.bad { color: var(--bad); } .delta.same { color: var(--muted); }
  .compare-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; margin: 0 0 10px; cursor: pointer; user-select: none; }
  .compare-toggle input { cursor: pointer; }
  .compare-toggle code { background: #eef2ff; padding: 1px 4px; border-radius: 3px; }
  .effort-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13px; color: #374151; margin: 0 0 10px; }
  .effort-filter .ef-label { font-weight: 600; }
  .effort-filter .ef-opt { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 2px 8px; }
  .effort-filter .ef-opt input { cursor: pointer; }
  /* Long model slugs wrap instead of widening the column. */
  #matrix th { white-space: normal; overflow-wrap: anywhere; vertical-align: top; min-width: 72px; }
  #matrix th .effort { display: inline-block; margin-top: 3px; font-weight: 400; font-size: 10px; color: var(--muted); background: #eef2ff; border-radius: 3px; padding: 0 4px; }
  /* Model header tint by provider/vendor brand (see modelBrand). */
  #matrix th.brand-openai { background: #ffffff; }
  #matrix th.brand-anthropic { background: #fbe2ce; }
  #matrix th.brand-google { background: #d6f0dc; }
  #matrix th.brand-moonshotai { background: #d7e6fb; }
  #matrix th.brand-x-ai { background: #e3e8ef; }
  #matrix th.brand-qwen { background: #e9dcfb; }
  #matrix th.brand-other { background: #f3f4f6; }
  #matrix td.mcell { cursor: pointer; }
  #matrix td.mcell:hover { outline: 2px solid var(--accent); outline-offset: -2px; }
  #matrix td.mcell.static { cursor: default; }
  #matrix td.mcell.static:hover { outline: none; }
  /* Matrix comparison rows: keep per-cell shading, just mark the row + label. */
  #matrix tr.compare-row td { border-top-style: dashed; }
  #matrix tr.compare-row td:first-child { background: #fff7ed; color: #7c2d12; text-align: left; }
  #matrix td.mcell.expanded { outline: 2px solid var(--accent); outline-offset: -2px; background: #dbeafe; }
  #matrix td.all-found { background: #dcfce7; }
  #matrix td.none-found { background: #fee2e2; }
  #matrix td.some-found { background: #fef9c3; }
  #matrix .imgname { font-weight: 600; }
  #matrix .expdesc { color: var(--muted); font-size: 12px; white-space: normal; max-width: 320px; }
  tr.matrix-detail td { text-align: left; white-space: normal; background: #f8fafc; padding: 14px 18px; }
  /* Drill-down lays the reps beside the screenshot they describe. The detail cell
     spans the full (very wide) matrix, so the block is pinned to the viewport's
     left edge (sticky) and sized to the viewport rather than the table — otherwise
     the screenshot lands far off-screen to the right. The shot stays put while the
     reps scroll, and stacks above the reps on narrow viewports. */
  .matrix-exp { position: sticky; left: 24px; display: flex; gap: 18px; align-items: flex-start; width: calc(100vw - 96px); max-width: 1160px; }
  .matrix-exp-main { flex: 1 1 auto; min-width: 0; }
  .matrix-exp-shot { flex: 0 0 320px; position: sticky; top: 8px; }
  .matrix-exp-shot img { width: 100%; border: 1px solid var(--line); border-radius: 4px; background: #fff; display: block; }
  .matrix-exp-shot .shot-cap { color: var(--muted); font-size: 12px; margin-top: 6px; word-break: break-all; }
  @media (max-width: 760px) { .matrix-exp { flex-direction: column-reverse; } .matrix-exp-shot { position: static; flex-basis: auto; width: 100%; max-width: 340px; } }
  .rep-block { border: 1px solid var(--line); border-radius: 6px; background: #fff; padding: 10px 12px; margin: 8px 0; }
  .rep-block .reported-list { margin: 6px 0 0 0; padding-left: 22px; }
  .reported-list li { margin: 3px 0; }
  .reported-list li.matched { background: #dcfce7; border-left: 3px solid var(--ok); padding: 2px 6px; list-style-position: inside; }
  .ovr-badge { display: inline-block; background: #111827; color: #fff; border-radius: 4px; padding: 1px 6px; font-size: 11px; margin-left: 6px; }
  .imgcard { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin: 16px 0; }
  .imgcard img { max-width: 320px; max-height: 220px; border: 1px solid var(--line); border-radius: 4px; float: right; margin: 0 0 12px 16px; }
  .exp-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; flex-wrap: wrap; }
  .exp-text { flex: 1 1 320px; }
  .chip { display: inline-block; min-width: 34px; text-align: center; padding: 2px 6px; border-radius: 10px; font-size: 11px; cursor: pointer; border: 1px solid transparent; color: #fff; }
  .chip.found { background: var(--ok); } .chip.missed { background: var(--bad); }
  .chip.na { background: #d1d5db; color: #374151; cursor: default; }
  .chip.overridden { border: 2px dashed #111827; }
  .extras { margin-top: 10px; font-size: 13px; }
  .extra-item { margin: 3px 0 3px 16px; }
  .extra-item .chip { min-width: 60px; }
  .extra-item .chip.extra { background: #b45309; } .extra-item .chip.not-extra { background: #4b5563; }
  details { margin-top: 8px; } summary { cursor: pointer; color: var(--accent); font-size: 13px; }
  .rawsum { background: #f9fafb; border: 1px solid var(--line); border-radius: 4px; padding: 8px; margin: 6px 0; font-size: 13px; }
  .toolbar { position: sticky; bottom: 0; background: #fff; border-top: 1px solid var(--line); padding: 10px 24px; display: flex; gap: 12px; align-items: center; }
  button { background: var(--accent); color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font-size: 14px; cursor: pointer; }
  #override-count { color: var(--muted); font-size: 13px; }
  .clearfix::after { content: ""; display: table; clear: both; }
  .errcell { color: var(--bad); }
</style>
</head>
<body>
<main>
  <h1>Visual reasoning benchmark</h1>
  <div class="prompt-hero">
    <div class="variant-controls">${variantSwitchHtml}</div>
    <div class="prompt-text" id="prompt-text">&#8220;${escapeHtml(defaultScores.prompt)}&#8221;</div>
    <span class="judge-badge">Judge: ${escapeHtml(defaultScores.judgeModel)} · ${escapeHtml(defaultScores.judgePromptVersion)}</span>
    <span class="sibling-links">${siblingLinksHtml}</span>
  </div>
  <div class="meta" id="meta"></div>
  <h2>Screenshot × model matrix</h2>
  <p class="meta">Cells = reps where the judge matched every expected issue ("clean n/m" on negative controls; † = failed reps excluded). Click a cell to expand that model's reported issues per rep, with judge-matched issues highlighted.</p>
  ${compareToggleHtml}
  <div id="effort-filter" class="effort-filter"></div>
  <div style="overflow-x:auto"><table id="matrix"><thead></thead><tbody></tbody></table></div>
  <h2>Leaderboard</h2>
  <p class="meta">Click a column header to sort (hover a header for its definition); click a row to inspect a model. Flakiness = expected issues found in some reps but not others of the same screenshot. Extras/run = reported issues the judge matched to no expected issue (noise) — lower is better.</p>
  <div style="overflow-x:auto"><table id="leaderboard"><thead></thead><tbody></tbody></table></div>
  <div id="detail"></div>
</main>
<div class="toolbar">
  <button id="export">Export overrides.json</button>
  <span id="override-count"></span>
  <span class="meta">Click found/missed and extra chips to override judge verdicts, then export and save as bench/results/overrides.json and re-run pnpm bench:score &amp;&amp; pnpm bench:report.</span>
</div>
<script type="application/json" id="data">${json}</script>
<script>
"use strict";
const DATA = JSON.parse(document.getElementById("data").textContent);
// Path prefix for screenshot <img> hrefs, relative to this report's own file.
const IMAGE_BASE = DATA.imageBase;
// Current prompt variant. The switcher swaps \`scores\` and re-renders everything.
// Honor #variant=<v> from the URL so cross-judge links keep the reader on the
// same prompt variant; fall back to the report default if it's absent/unknown.
function variantFromHash() {
  const m = /(?:^|[#&])variant=([^&]+)/.exec(location.hash || "");
  const v = m ? decodeURIComponent(m[1]) : null;
  return v && DATA.scoresByVariant[v] ? v : null;
}
let currentVariant = variantFromHash() || DATA.defaultVariant;
let scores = DATA.scoresByVariant[currentVariant];
const manifestByImage = Object.fromEntries(DATA.manifest.map(e => [e.imageId, e]));
// Forced verdict states accumulated in this page session, seeded from committed overrides.
const overrides = structuredClone(DATA.overrides || {});

// Reasoning-effort filter. Each (model, effort) pair is its own "series"; this set
// controls which efforts are visible in the matrix + leaderboard. All on by default;
// the control only renders when more than one effort is present across the variants.
const allEfforts = [...new Set(
  Object.values(DATA.scoresByVariant).flatMap(s => s.models.map(m => m.reasoningEffort))
)].sort();
const activeEfforts = new Set(allEfforts);

const fmt = (v, digits = 2, suffix = "") => (v === null || v === undefined) ? "–" : v.toFixed(digits) + suffix;
const pct = v => (v === null || v === undefined) ? "–" : (100 * v).toFixed(0) + "%";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

let REPS = Array.from({ length: scores.repeats }, (_, i) => i + 1);

// Prompt text + meta line reflect the selected variant.
function renderHero() {
  document.getElementById("prompt-text").textContent = "\\u201c" + scores.prompt + "\\u201d";
  document.getElementById("meta").innerHTML =
    "Generated " + esc(scores.generatedAt) + " · variant <code>" + esc(scores.promptVariant) + "</code>" +
    " · prompt sha256 " + esc(scores.promptHash.slice(0, 12)) + "…" +
    " · reasoning effort <code>" + esc(scores.reasoningEffort) + "</code> · " + scores.repeats + " reps" +
    " · " + scores.overrideCount + " committed override cell(s)";
}

// Identity is the "series" (model × reasoning effort), so a model benchmarked at
// several efforts stays distinct across the matrix, leaderboard, and overrides.
// Effort filter checkboxes. Static across variants (efforts don't change with the
// prompt), so this is built once at init. Toggling re-renders both tables.
function renderEffortFilter() {
  const el = document.getElementById("effort-filter");
  if (!el) return;
  if (allEfforts.length < 2) { el.style.display = "none"; return; }
  el.innerHTML = '<span class="ef-label">Reasoning effort:</span>' +
    allEfforts.map(e => '<label class="ef-opt"><input type="checkbox" data-effort="' + esc(e) + '"' +
      (activeEfforts.has(e) ? " checked" : "") + "> " + esc(e) + "</label>").join("");
  el.querySelectorAll("input[data-effort]").forEach(cb => cb.onchange = () => {
    const e = cb.dataset.effort;
    if (cb.checked) activeEfforts.add(e); else activeEfforts.delete(e);
    // Never allow an empty selection — keep the one just unchecked.
    if (activeEfforts.size === 0) { activeEfforts.add(e); cb.checked = true; return; }
    if (selectedModel && !scores.models.some(m => m.series === selectedModel && activeEfforts.has(m.reasoningEffort))) {
      selectedModel = null;
    }
    expandedCell = null;
    renderMatrix();
    renderLeaderboard();
    renderDetail();
  });
}

function cellFor(series, imageId, rep, src) {
  return (src || scores).cells.find(c => c.series === series && c.imageId === imageId && c.rep === rep);
}
function keyFor(cell) {
  return cell.series + "/" + cell.imageId + "/rep_" + cell.rep;
}
function overrideEntry(key) {
  return overrides[key] || (overrides[key] = {});
}
function effectiveFound(cell, expIndex, key) {
  const forced = overrides[key] && overrides[key].expected && overrides[key].expected[String(expIndex)];
  if (forced) return forced === "found";
  const entry = cell.expected.find(e => e.expectedIndex === expIndex);
  return entry ? entry.found : false;
}
function effectiveExtra(cell, repIndex, key) {
  const forced = overrides[key] && overrides[key].extras && overrides[key].extras[String(repIndex)];
  if (forced) return forced === "extra";
  return cell.extraReportedIndexes.includes(repIndex);
}
function countOverrides() {
  let n = 0;
  for (const entry of Object.values(overrides)) {
    n += Object.keys(entry.expected || {}).length + Object.keys(entry.extras || {}).length;
  }
  document.getElementById("override-count").textContent = n + " override state(s) staged";
}

// Shared chip handler: staging an override re-renders matrix, detail, and counts.
function bindChips(container) {
  container.querySelectorAll(".chip[data-kind]").forEach(chip => chip.onclick = () => {
    const { kind, key, index } = chip.dataset;
    const entry = overrideEntry(key);
    const cell = scores.cells.find(c => key === keyFor(c));
    if (kind === "expected") {
      entry.expected = entry.expected || {};
      entry.expected[index] = effectiveFound(cell, Number(index), key) ? "missed" : "found";
    } else {
      entry.extras = entry.extras || {};
      entry.extras[index] = effectiveExtra(cell, Number(index), key) ? "not-extra" : "extra";
    }
    countOverrides();
    renderMatrix();
    renderDetail();
  });
}

// --- Matrix (client-side mirror of bench/src/matrix.ts, override-aware) ---

let expandedCell = null; // { imageId, model } | null

function computeMatrixCell(series, entry, src) {
  const cells = REPS.map(rep => cellFor(series, entry.imageId, rep, src)).filter(Boolean);
  const ok = cells.filter(c => c.status === "ok");
  const negative = entry.expectedIssues.length === 0;
  return {
    okReps: ok.length,
    totalReps: cells.length,
    foundReps: negative ? null : ok.filter(c =>
      entry.expectedIssues.every((_, i) => effectiveFound(c, i, keyFor(c)))).length,
    cleanReps: negative ? ok.filter(c => c.reportedIssues.length === 0).length : null,
    hasErrors: cells.some(c => c.status === "error"),
  };
}

function formatCellText(m) {
  if (m.okReps === 0) return "–";
  const dagger = m.okReps < m.totalReps ? "†" : "";
  if (m.cleanReps !== null) return "clean " + m.cleanReps + "/" + m.okReps + dagger;
  return m.foundReps + "/" + m.okReps + dagger;
}

function cellShadeClass(m) {
  if (m.okReps === 0) return "";
  const n = m.cleanReps !== null ? m.cleanReps : m.foundReps;
  if (n === m.okReps) return "all-found";
  if (n === 0) return "none-found";
  return "some-found";
}

function expansionHtml(series, entry) {
  const shot = '<aside class="matrix-exp-shot">' +
    '<img src="' + IMAGE_BASE + '/' + esc(entry.filename) + '" alt="' + esc(entry.imageId) + '" loading="lazy">' +
    '<div class="shot-cap">' + esc(entry.imageId) + " · " + esc(entry.filename) + "</div></aside>";
  let html = '<div class="matrix-exp-main">';
  html += '<div><strong>' + esc(series) + "</strong> on " + esc(entry.imageId) + " · " + esc(entry.filename) + "</div>";
  for (const rep of REPS) {
    const cell = cellFor(series, entry.imageId, rep);
    if (!cell) continue;
    if (cell.status !== "ok") {
      html += '<div class="rep-block"><strong>rep ' + rep + '</strong> <span class="errcell">FAILED: ' + esc(cell.error ? cell.error.message : "") + "</span></div>";
      continue;
    }
    const key = keyFor(cell);
    html += '<div class="rep-block"><strong>rep ' + rep + "</strong>";
    entry.expectedIssues.forEach((text, expIndex) => {
      const judgeEntry = cell.expected.find(e => e.expectedIndex === expIndex);
      const found = effectiveFound(cell, expIndex, key);
      const forced = overrides[key] && overrides[key].expected && overrides[key].expected[String(expIndex)];
      const isOverridden = forced || (judgeEntry && judgeEntry.overridden);
      const noPointer = found && isOverridden && (!judgeEntry || judgeEntry.matchedReportedIndexes.length === 0);
      html += '<div class="exp-row"><span class="exp-text">' + esc(text) + "</span>" +
        '<span class="chip ' + (found ? "found" : "missed") + (isOverridden ? " overridden" : "") + '"' +
        ' data-kind="expected" data-key="' + esc(key) + '" data-index="' + expIndex + '"' +
        ' title="' + esc(judgeEntry ? judgeEntry.reasoning : "") + '">' + (found ? "✓ found" : "✗ missed") + "</span>" +
        (noPointer ? '<span class="ovr-badge">overridden → found</span>' : "") +
        "</div>";
    });
    if (cell.reportedIssues.length === 0) {
      html += '<div class="meta">No issues reported.</div>';
    } else {
      const matchedIndexes = new Set();
      cell.expected.forEach(e => e.matchedReportedIndexes.forEach(i => matchedIndexes.add(i)));
      html += '<ol class="reported-list" start="0">';
      cell.reportedIssues.forEach((issue, i) => {
        const matched = matchedIndexes.has(i);
        html += '<li class="' + (matched ? "matched" : "") + '">[' + esc(issue.priority) + "/" + esc(issue.category) + "] " + esc(issue.description) +
          (matched ? ' <span class="ovr-badge" style="background:var(--ok)">matched</span>' : "") + "</li>";
      });
      html += "</ol>";
    }
    html += "</div>";
  }
  html += "</div>";
  return '<div class="matrix-exp">' + html + shot + "</div>";
}

// Mirrors modelBrand + matrixModelOrder in bench/src/matrix.ts: models grouped
// by provider/vendor brand, brand groups and within-group models ordered
// weakest-first (ascending mean recall) so columns read weakest → strongest.
function modelBrand(provider, model) {
  if (provider === "openrouter") { const i = model.indexOf("/"); return i === -1 ? provider : model.slice(0, i); }
  return provider;
}
function matrixModels(src) {
  const models = (src || scores).models.filter(m => activeEfforts.has(m.reasoningEffort));
  const recall = m => (m.meanRecall == null ? -1 : m.meanRecall);
  const groups = new Map();
  for (const m of models) {
    const b = modelBrand(m.provider, m.model);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(m);
  }
  const strength = g => g.reduce((s, m) => s + recall(m), 0) / g.length;
  const brands = [...groups.entries()].sort((a, b) => strength(a[1]) - strength(b[1]) || a[0].localeCompare(b[0]));
  return brands.flatMap(([, g]) =>
    g.slice().sort((a, b) => recall(a) - recall(b) || a.series.localeCompare(b.series)).map(m => m.series));
}

// Change in a matrix cell's score (found reps, or clean reps on negative
// controls) for a comparison row vs its baseline row. Higher is better.
function matrixDelta(mb, me) {
  const b = mb.cleanReps !== null ? mb.cleanReps : mb.foundReps;
  const e = me.cleanReps !== null ? me.cleanReps : me.foundReps;
  if (b === null || e === null || mb.okReps === 0 || me.okReps === 0) return "";
  const d = e - b;
  if (d === 0) return "";
  return ' <span class="delta ' + (d > 0 ? "good" : "bad") + '">' + (d > 0 ? "▲+" : "▼") + d + "</span>";
}

function renderMatrix() {
  // Compare mode mirrors the leaderboard: a fixed baseline spine (variantOrder[0])
  // with each other variant paired as a row beneath each screenshot. Cell drill-down
  // is available in normal mode; compare mode is a read-only overview.
  const compareEl = document.getElementById("compare-variants");
  const compareOn = !!(compareEl && compareEl.checked) && DATA.variantOrder.length > 1;
  const primaryVariant = DATA.variantOrder[0];
  const baseSrc = compareOn ? DATA.scoresByVariant[primaryVariant] : scores;

  const series = matrixModels(baseSrc);
  const effortBySeries = Object.fromEntries(baseSrc.models.map(m => [m.series, m.reasoningEffort]));
  const brandBySeries = Object.fromEntries(baseSrc.models.map(m => [m.series, modelBrand(m.provider, m.model)]));
  const thead = document.querySelector("#matrix thead");
  // Header shows the full series id (model + any non-default effort/fidelity tags);
  // the effort sublabel stays for quick scanning.
  thead.innerHTML = "<tr><th>Screenshot</th><th>Expected issue</th>" +
    series.map(s => '<th class="brand-' + esc(brandBySeries[s] || "other") + '">' + esc(s) +
      '<br><span class="effort">' + esc(effortBySeries[s] || "?") + "</span></th>").join("") + "</tr>";
  const tbody = document.querySelector("#matrix tbody");
  let html = "";
  for (const entry of DATA.manifest) {
    const desc = entry.expectedIssues.length === 0
      ? "no expected issues (negative control)"
      : entry.expectedIssues.join("; ");
    const baseTag = compareOn ? ' <span class="row-variant base">' + esc(primaryVariant) + "</span>" : "";
    html += "<tr>" +
      '<td><span class="imgname">' + esc(entry.imageId) + "</span><br>" + esc(entry.filename) + "</td>" +
      '<td class="expdesc">' + esc(desc) + baseTag + "</td>" +
      series.map(s => {
        const m = computeMatrixCell(s, entry, baseSrc);
        const isExpanded = !compareOn && expandedCell && expandedCell.imageId === entry.imageId && expandedCell.model === s;
        return '<td class="mcell ' + cellShadeClass(m) + (isExpanded ? " expanded" : "") + (compareOn ? " static" : "") + '"' +
          ' data-image="' + esc(entry.imageId) + '" data-model="' + esc(s) + '">' +
          formatCellText(m) + "</td>";
      }).join("") + "</tr>";
    if (!compareOn && expandedCell && expandedCell.imageId === entry.imageId) {
      html += '<tr class="matrix-detail"><td colspan="' + (series.length + 2) + '">' +
        expansionHtml(expandedCell.model, entry) + "</td></tr>";
    }
    if (compareOn) {
      for (const v of DATA.variantOrder.slice(1)) {
        const src = DATA.scoresByVariant[v];
        html += '<tr class="compare-row"><td colspan="2"><span class="indent">↳</span>' +
          '<span class="row-variant comp">' + esc(v) + "</span></td>" +
          series.map(s => {
            const mb = computeMatrixCell(s, entry, baseSrc);
            const me = computeMatrixCell(s, entry, src);
            return '<td class="mcell static ' + cellShadeClass(me) + '">' +
              formatCellText(me) + matrixDelta(mb, me) + "</td>";
          }).join("") + "</tr>";
      }
    }
  }
  tbody.innerHTML = html;
  if (!compareOn) {
    tbody.querySelectorAll("td.mcell").forEach(td => td.onclick = () => {
      const { image, model } = td.dataset;
      expandedCell = (expandedCell && expandedCell.imageId === image && expandedCell.model === model)
        ? null : { imageId: image, model };
      renderMatrix();
    });
  }
  bindChips(tbody);
}

// --- Leaderboard + per-model detail (unchanged behavior) ---

// [key, label, getter, render, tooltip]
const COLUMNS = [
  ["model", "Model", m => m.series, v => v, "Model under test (model name plus any non-default reasoning-effort / image-fidelity tags)"],
  ["provider", "Provider", m => m.provider, v => v, "API provider the model runs on"],
  ["reasoningEffort", "Effort", m => m.reasoningEffort, v => v,
    "Reasoning/thinking effort the runs used (from the run records). Mixed values across a model's runs are joined, e.g. 'low, high'."],
  ["meanRecall", "Recall", m => m.meanRecall, pct,
    "Mean per-expected-issue detection rate across reps: of the successful runs on an image, the share where the judge matched the expected issue, averaged over all expected issues."],
  ["anyRecall", "Recall (any rep)", m => m.anyRecall, pct,
    "Share of expected issues found in at least one rep. The gap to Recall shows how much repetition helps."],
  ["flakiness", "Flakiness", m => m.flakiness, pct,
    "Share of expected issues detected inconsistently: found in some reps but not others of the same screenshot. High flakiness = same screenshot, different answers run to run."],
  ["extrasPerRun", "Extras/run", m => m.extrasPerRun, v => fmt(v, 1),
    "Mean reported issues per successful run that the judge could not match to any expected issue: false positives / noise. Lower is better."],
  ["latencyMedianSeconds", "Latency med", m => m.latencyMedianSeconds, v => fmt(v, 1, "s"), "Median response time per run"],
  ["latencyP95Seconds", "Latency p95", m => m.latencyP95Seconds, v => fmt(v, 1, "s"), "95th-percentile response time per run"],
  ["meanCostPerRun", "Cost/run", m => m.meanCostPerRun, v => v == null ? "–" : "$" + v.toFixed(4), "Mean estimated API cost per run"],
  ["failedRuns", "Failed", m => m.failedRuns, v => v || "", "Runs that errored after all retries"],
];
let sortKey = "meanRecall", sortDir = -1, selectedModel = null;

// Columns that get a Δ badge (vs the baseline row) on comparison sub-rows.
const DELTA_COLS = new Set(["meanRecall", "anyRecall", "flakiness", "extrasPerRun"]);

// Signed change of a comparison row's metric vs its baseline row, colored by
// whether the change is an improvement (recall up / extras + flakiness down).
function deltaBadge(key, cur, base) {
  if (cur === null || cur === undefined || base === null || base === undefined) return "";
  const d = cur - base;
  if (Math.abs(d) < 1e-9) return ' <span class="delta same">±0</span>';
  const higherBetter = key === "meanRecall" || key === "anyRecall";
  const isPoints = higherBetter || key === "flakiness"; // rate metrics shown in points
  const good = higherBetter ? d > 0 : d < 0;
  const txt = isPoints ? (100 * d).toFixed(1) + "pp" : d.toFixed(2);
  return ' <span class="delta ' + (good ? "good" : "bad") + '">' + (d > 0 ? "▲+" : "▼") + txt + "</span>";
}

// One leaderboard <tr>. In compare mode the primary row carries a variant tag and
// the model name; sub-rows are indented, tagged, and carry Δ badges vs \`base\`.
function leaderboardRow(m, opts) {
  const { variant = null, isCompare = false, base = null } = opts || {};
  const cells = COLUMNS.map(([key, , get, render]) => {
    if (key === "model") {
      if (isCompare) return '<td><span class="indent">↳</span><span class="row-variant comp">' + esc(variant) + "</span></td>";
      if (variant) return '<td><span class="row-variant base">' + esc(variant) + "</span>" + esc(m.series) + "</td>";
      return "<td>" + esc(m.series) + "</td>";
    }
    let inner = render(get(m));
    if (base && DELTA_COLS.has(key)) inner += deltaBadge(key, get(m), get(base));
    return "<td" + (key === "failedRuns" && m.failedRuns ? ' class="errcell"' : "") + ">" + inner + "</td>";
  }).join("");
  const cls = (isCompare ? "compare-row" : "") + (m.series === selectedModel ? " selected" : "");
  return '<tr data-model="' + esc(m.series) + '"' + (cls.trim() ? ' class="' + cls.trim() + '"' : "") + ">" + cells + "</tr>";
}

function renderLeaderboard() {
  const thead = document.querySelector("#leaderboard thead");
  thead.innerHTML = "<tr>" + COLUMNS.map(([key, label, , , tooltip]) =>
    '<th data-key="' + key + '" title="' + esc(tooltip || "") + '">' + label + (key === sortKey ? (sortDir < 0 ? " ▼" : " ▲") : "") + "</th>").join("") + "</tr>";
  thead.querySelectorAll("th").forEach(th => th.onclick = () => {
    const key = th.dataset.key;
    if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = key === "model" || key === "provider" ? 1 : -1; }
    renderLeaderboard();
  });
  // Compare mode: fixed spine = primary variant (variantOrder[0]), with each
  // other variant paired beneath. Otherwise the leaderboard follows the dropdown.
  const compareEl = document.getElementById("compare-variants");
  const compareOn = !!(compareEl && compareEl.checked) && DATA.variantOrder.length > 1;
  const primaryVariant = DATA.variantOrder[0];
  const spine = (compareOn ? DATA.scoresByVariant[primaryVariant].models : scores.models)
    .filter(m => activeEfforts.has(m.reasoningEffort));

  const col = COLUMNS.find(c => c[0] === sortKey);
  const rows = [...spine].sort((a, b) => {
    const va = col[2](a), vb = col[2](b);
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * sortDir;
  });

  let html = "";
  for (const m of rows) {
    if (!compareOn) { html += leaderboardRow(m, {}); continue; }
    html += leaderboardRow(m, { variant: primaryVariant });
    for (const v of DATA.variantOrder.slice(1)) {
      const cm = (DATA.scoresByVariant[v].models || []).find(x => x.series === m.series);
      if (cm) html += leaderboardRow(cm, { variant: v, isCompare: true, base: m });
    }
  }
  const tbody = document.querySelector("#leaderboard tbody");
  tbody.innerHTML = html;
  tbody.querySelectorAll("tr").forEach(tr => tr.onclick = () => { selectedModel = tr.dataset.model; renderLeaderboard(); renderDetail(); });
}

function renderDetail() {
  const container = document.getElementById("detail");
  if (!selectedModel) { container.innerHTML = ""; return; }
  let html = "<h2>" + selectedModel + "</h2>";
  for (const entry of DATA.manifest) {
    const cells = REPS.map(rep => cellFor(selectedModel, entry.imageId, rep));
    if (cells.every(c => !c)) continue;
    html += '<div class="imgcard clearfix"><img src="' + IMAGE_BASE + '/' + entry.filename + '" alt="' + entry.imageId + '" loading="lazy">';
    html += "<h3>" + entry.imageId + " · " + entry.filename + "</h3>";
    if (entry.expectedIssues.length === 0) html += '<p class="meta">Negative control — no expected issues; anything reported counts as an extra.</p>';
    entry.expectedIssues.forEach((text, expIndex) => {
      html += '<div class="exp-row"><span class="exp-text">' + text + "</span>";
      REPS.forEach(rep => {
        const cell = cells[rep - 1];
        if (!cell || cell.status !== "ok") { html += '<span class="chip na" title="no successful run">r' + rep + "</span>"; return; }
        const key = keyFor(cell);
        const found = effectiveFound(cell, expIndex, key);
        const judgeEntry = cell.expected.find(e => e.expectedIndex === expIndex);
        const forced = overrides[key] && overrides[key].expected && overrides[key].expected[String(expIndex)];
        html += '<span class="chip ' + (found ? "found" : "missed") + (forced || (judgeEntry && judgeEntry.overridden) ? " overridden" : "") + '"' +
          ' data-kind="expected" data-key="' + key + '" data-index="' + expIndex + '"' +
          ' title="' + (judgeEntry ? judgeEntry.reasoning.replace(/"/g, "&quot;") : "") + '">r' + rep + " " + (found ? "✓" : "✗") + "</span>";
      });
      html += "</div>";
    });
    html += '<div class="extras"><strong>Extra reported issues</strong>';
    let anyExtras = false;
    REPS.forEach(rep => {
      const cell = cells[rep - 1];
      if (!cell || cell.status !== "ok") return;
      const key = keyFor(cell);
      cell.reportedIssues.forEach((issue, repIndex) => {
        const isExtra = effectiveExtra(cell, repIndex, key);
        if (!isExtra) return;
        anyExtras = true;
        const forced = overrides[key] && overrides[key].extras && overrides[key].extras[String(repIndex)];
        html += '<div class="extra-item">rep ' + rep + ": [" + issue.priority + "/" + issue.category + "] " + issue.description +
          ' <span class="chip extra' + (forced ? " overridden" : "") + '" data-kind="extra" data-key="' + key + '" data-index="' + repIndex + '">extra</span></div>';
      });
    });
    if (!anyExtras) html += '<div class="meta" style="margin-left:16px">none</div>';
    html += "</div><details><summary>Raw model summaries</summary>";
    REPS.forEach(rep => {
      const cell = cells[rep - 1];
      if (!cell) return;
      html += '<div class="rawsum"><strong>rep ' + rep + (cell.status === "error" ? " (FAILED: " + (cell.error ? cell.error.message : "") + ")" : "") + ":</strong> " + (cell.summary || "") + "</div>";
    });
    html += "</details></div>";
  }
  container.innerHTML = html;
  bindChips(container);
}

document.getElementById("export").onclick = () => {
  const cleaned = {};
  for (const [key, entry] of Object.entries(overrides)) {
    const out = {};
    if (entry.expected && Object.keys(entry.expected).length) out.expected = entry.expected;
    if (entry.extras && Object.keys(entry.extras).length) out.extras = entry.extras;
    if (entry.note) out.note = entry.note;
    if (Object.keys(out).length) cleaned[key] = out;
  }
  const blob = new Blob([JSON.stringify(cleaned, null, 2) + "\\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "overrides.json";
  a.click();
  URL.revokeObjectURL(a.href);
};

// Reflect the current variant in the URL hash and in the cross-judge links, so
// clicking another judge lands on the same prompt variant (that report reads
// #variant on load). Judges that never scored this variant fall back to their
// default, since variantFromHash() only honors variants they actually have.
function syncVariantLinks() {
  const hash = "#variant=" + encodeURIComponent(currentVariant);
  if (history.replaceState) history.replaceState(null, "", hash);
  else location.hash = hash;
  document.querySelectorAll("a.judge-link").forEach(a => {
    a.setAttribute("href", a.getAttribute("href").split("#")[0] + hash);
  });
}

// Switching variant swaps the scored dataset and re-renders the whole report.
const variantSelect = document.getElementById("variant");
if (variantSelect) {
  variantSelect.value = currentVariant;
  variantSelect.addEventListener("change", () => {
    currentVariant = variantSelect.value;
    scores = DATA.scoresByVariant[currentVariant];
    REPS = Array.from({ length: scores.repeats }, (_, i) => i + 1);
    expandedCell = null;
    if (selectedModel && !scores.models.some(m => m.series === selectedModel)) selectedModel = null;
    syncVariantLinks();
    renderHero();
    renderMatrix();
    renderLeaderboard();
    renderDetail();
  });
}

// The compare checkbox re-lays-out both tables (paired rows on/off). Any open
// matrix drill-down is cleared since compare mode is a read-only overview.
const compareToggle = document.getElementById("compare-variants");
if (compareToggle) compareToggle.addEventListener("change", () => {
  expandedCell = null;
  renderMatrix();
  renderLeaderboard();
});

syncVariantLinks();
renderHero();
renderEffortFilter();
renderMatrix();
renderLeaderboard();
countOverrides();
</script>
</body>
</html>
`;
}
