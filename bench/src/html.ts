import type { Manifest, Overrides, Scores } from "./types.js";
import { modelDirName } from "./util.js";

/**
 * Build the self-contained report page. All data is inlined as JSON; the only
 * external references are the golden screenshots, loaded via relative paths
 * (the report lives in bench/results/, so ../../golden_data_set/<file> works
 * when viewed from the repo).
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
  scores: Scores,
  manifest: Manifest,
  overrides: Overrides,
  siblingJudges: readonly string[] = [],
): string {
  const payload = {
    scores,
    manifest: manifest.entries,
    overrides,
  };
  // </script> inside JSON would terminate the script block early.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");

  // The hero and meta line are static data — rendered at build time so the
  // prompt and judge are visible even without JavaScript.
  const siblingLinksHtml =
    siblingJudges.length > 0
      ? "Other judges: " +
        siblingJudges
          .map(
            (judge) =>
              `<a href="report.${escapeHtml(modelDirName(judge))}.html">${escapeHtml(judge)}</a>`,
          )
          .join(" · ") +
        ' · <a href="JUDGE_COMPARISON.md">comparison</a>'
      : "";
  const metaHtml =
    `Generated ${escapeHtml(scores.generatedAt)} · prompt sha256 ${escapeHtml(scores.promptHash.slice(0, 12))}…` +
    ` · reasoning effort <code>${escapeHtml(scores.reasoningEffort)}</code> · ${scores.repeats} reps` +
    ` · ${scores.overrideCount} committed override cell(s)`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Visual reasoning benchmark — judge ${scores.judgeModel}</title>
<style>
  :root { --ok: #15803d; --bad: #b91c1c; --muted: #6b7280; --line: #e5e7eb; --accent: #1d4ed8; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #111827; background: #fafafa; }
  main { max-width: 1400px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; } h2 { font-size: 18px; margin-top: 32px; } h3 { font-size: 15px; }
  .prompt-hero { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 14px 18px; margin: 12px 0 8px; }
  .prompt-hero .prompt-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 16px; }
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
  /* Long model slugs wrap instead of widening the column. */
  #matrix th { white-space: normal; overflow-wrap: anywhere; vertical-align: top; min-width: 72px; }
  #matrix td.mcell { cursor: pointer; }
  #matrix td.mcell:hover { outline: 2px solid var(--accent); outline-offset: -2px; }
  #matrix td.mcell.expanded { outline: 2px solid var(--accent); outline-offset: -2px; background: #dbeafe; }
  #matrix td.all-found { background: #dcfce7; }
  #matrix td.none-found { background: #fee2e2; }
  #matrix td.some-found { background: #fef9c3; }
  #matrix .imgname { font-weight: 600; }
  #matrix .expdesc { color: var(--muted); font-size: 12px; white-space: normal; max-width: 320px; }
  tr.matrix-detail td { text-align: left; white-space: normal; background: #f8fafc; padding: 14px 18px; }
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
    <div class="prompt-text">&#8220;${escapeHtml(scores.prompt)}&#8221;</div>
    <span class="judge-badge">Judge: ${escapeHtml(scores.judgeModel)} · ${escapeHtml(scores.judgePromptVersion)}</span>
    <span class="sibling-links">${siblingLinksHtml}</span>
  </div>
  <div class="meta">${metaHtml}</div>
  <h2>Screenshot × model matrix</h2>
  <p class="meta">Cells = reps where the judge matched every expected issue ("clean n/m" on negative controls; † = failed reps excluded). Click a cell to expand that model's reported issues per rep, with judge-matched issues highlighted.</p>
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
const scores = DATA.scores;
const manifestByImage = Object.fromEntries(DATA.manifest.map(e => [e.imageId, e]));
// Forced verdict states accumulated in this page session, seeded from committed overrides.
const overrides = structuredClone(DATA.overrides || {});

const fmt = (v, digits = 2, suffix = "") => (v === null || v === undefined) ? "–" : v.toFixed(digits) + suffix;
const pct = v => (v === null || v === undefined) ? "–" : (100 * v).toFixed(0) + "%";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const REPS = Array.from({ length: scores.repeats }, (_, i) => i + 1);

function cellFor(model, imageId, rep) {
  return scores.cells.find(c => c.model === model && c.imageId === imageId && c.rep === rep);
}
function keyFor(cell) {
  return cell.model + "/" + cell.imageId + "/rep_" + cell.rep;
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

function computeMatrixCell(model, entry) {
  const cells = REPS.map(rep => cellFor(model, entry.imageId, rep)).filter(Boolean);
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

function expansionHtml(model, entry) {
  let html = '<div><strong>' + esc(model) + "</strong> on " + esc(entry.imageId) + " · " + esc(entry.filename) + "</div>";
  for (const rep of REPS) {
    const cell = cellFor(model, entry.imageId, rep);
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
  return html;
}

// Mirrors matrixModelOrder in bench/src/matrix.ts: provider groups in fixed
// order, leaderboard order preserved within each group.
const PROVIDER_COLUMN_ORDER = ["openai", "anthropic", "google", "openrouter"];
function matrixModels() {
  const rank = p => { const i = PROVIDER_COLUMN_ORDER.indexOf(p); return i === -1 ? PROVIDER_COLUMN_ORDER.length : i; };
  return [...scores.models].sort((a, b) => rank(a.provider) - rank(b.provider)).map(m => m.model);
}

function renderMatrix() {
  const models = matrixModels();
  const thead = document.querySelector("#matrix thead");
  thead.innerHTML = "<tr><th>Screenshot</th><th>Expected issue</th>" +
    models.map(m => "<th>" + esc(m) + "</th>").join("") + "</tr>";
  const tbody = document.querySelector("#matrix tbody");
  let html = "";
  for (const entry of DATA.manifest) {
    const desc = entry.expectedIssues.length === 0
      ? "no expected issues (negative control)"
      : entry.expectedIssues.join("; ");
    html += "<tr>" +
      '<td><span class="imgname">' + esc(entry.imageId) + "</span><br>" + esc(entry.filename) + "</td>" +
      '<td class="expdesc">' + esc(desc) + "</td>" +
      models.map(model => {
        const m = computeMatrixCell(model, entry);
        const isExpanded = expandedCell && expandedCell.imageId === entry.imageId && expandedCell.model === model;
        return '<td class="mcell ' + cellShadeClass(m) + (isExpanded ? " expanded" : "") + '"' +
          ' data-image="' + esc(entry.imageId) + '" data-model="' + esc(model) + '">' +
          formatCellText(m) + "</td>";
      }).join("") + "</tr>";
    if (expandedCell && expandedCell.imageId === entry.imageId) {
      html += '<tr class="matrix-detail"><td colspan="' + (models.length + 2) + '">' +
        expansionHtml(expandedCell.model, entry) + "</td></tr>";
    }
  }
  tbody.innerHTML = html;
  tbody.querySelectorAll("td.mcell").forEach(td => td.onclick = () => {
    const { image, model } = td.dataset;
    expandedCell = (expandedCell && expandedCell.imageId === image && expandedCell.model === model)
      ? null : { imageId: image, model };
    renderMatrix();
  });
  bindChips(tbody);
}

// --- Leaderboard + per-model detail (unchanged behavior) ---

// [key, label, getter, render, tooltip]
const COLUMNS = [
  ["model", "Model", m => m.model, v => v, "Model under test"],
  ["provider", "Provider", m => m.provider, v => v, "API provider the model runs on"],
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

function renderLeaderboard() {
  const thead = document.querySelector("#leaderboard thead");
  thead.innerHTML = "<tr>" + COLUMNS.map(([key, label, , , tooltip]) =>
    '<th data-key="' + key + '" title="' + esc(tooltip || "") + '">' + label + (key === sortKey ? (sortDir < 0 ? " ▼" : " ▲") : "") + "</th>").join("") + "</tr>";
  thead.querySelectorAll("th").forEach(th => th.onclick = () => {
    const key = th.dataset.key;
    if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = key === "model" || key === "provider" ? 1 : -1; }
    renderLeaderboard();
  });
  const col = COLUMNS.find(c => c[0] === sortKey);
  const rows = [...scores.models].sort((a, b) => {
    const va = col[2](a), vb = col[2](b);
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * sortDir;
  });
  const tbody = document.querySelector("#leaderboard tbody");
  tbody.innerHTML = rows.map(m => '<tr data-model="' + m.model + '"' + (m.model === selectedModel ? ' class="selected"' : "") + ">" +
    COLUMNS.map(([key, , get, render]) => "<td" + (key === "failedRuns" && m.failedRuns ? ' class="errcell"' : "") + ">" + render(get(m)) + "</td>").join("") + "</tr>").join("");
  tbody.querySelectorAll("tr").forEach(tr => tr.onclick = () => { selectedModel = tr.dataset.model; renderLeaderboard(); renderDetail(); });
}

function renderDetail() {
  const container = document.getElementById("detail");
  if (!selectedModel) { container.innerHTML = ""; return; }
  let html = "<h2>" + selectedModel + "</h2>";
  for (const entry of DATA.manifest) {
    const cells = REPS.map(rep => cellFor(selectedModel, entry.imageId, rep));
    if (cells.every(c => !c)) continue;
    html += '<div class="imgcard clearfix"><img src="../../golden_data_set/' + entry.filename + '" alt="' + entry.imageId + '" loading="lazy">';
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

renderMatrix();
renderLeaderboard();
countOverrides();
</script>
</body>
</html>
`;
}
