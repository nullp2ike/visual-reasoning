import type { Manifest, Overrides, Scores } from "./types.js";

/**
 * Build the self-contained report page. All data is inlined as JSON; the only
 * external references are the golden screenshots, loaded via relative paths
 * (the report lives in bench/results/, so ../../golden_data_set/<file> works
 * when viewed from the repo).
 */
export function buildReportHtml(scores: Scores, manifest: Manifest, overrides: Overrides): string {
  const payload = {
    scores,
    manifest: manifest.entries,
    overrides,
  };
  // </script> inside JSON would terminate the script block early.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Visual reasoning benchmark</title>
<style>
  :root { --ok: #15803d; --bad: #b91c1c; --muted: #6b7280; --line: #e5e7eb; --accent: #1d4ed8; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #111827; background: #fafafa; }
  main { max-width: 1200px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; } h2 { font-size: 18px; margin-top: 32px; } h3 { font-size: 15px; }
  .meta { color: var(--muted); font-size: 12px; margin-bottom: 16px; }
  .meta code { background: #eef2ff; padding: 1px 4px; border-radius: 3px; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: right; white-space: nowrap; }
  th { background: #f3f4f6; cursor: pointer; user-select: none; position: sticky; top: 0; }
  th:first-child, td:first-child { text-align: left; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: #eff6ff; }
  tbody tr.selected { background: #dbeafe; }
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
  <div class="meta" id="meta"></div>
  <h2>Leaderboard</h2>
  <p class="meta">Click a column header to sort; click a row to inspect a model. Recall = share of expected issues detected (mean of per-issue detection rates over reps).</p>
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

document.getElementById("meta").innerHTML =
  "Generated " + scores.generatedAt + " · prompt <code>" + scores.prompt + "</code> (sha256 " + scores.promptHash.slice(0, 12) + "…)" +
  " · reasoning effort <code>" + scores.reasoningEffort + "</code> · " + scores.repeats + " reps" +
  " · judge <code>" + scores.judgeModel + " " + scores.judgePromptVersion + "</code>" +
  " · " + scores.overrideCount + " committed override cell(s)";

const COLUMNS = [
  ["model", "Model", m => m.model, v => v],
  ["provider", "Provider", m => m.provider, v => v],
  ["meanRecall", "Recall", m => m.meanRecall, pct],
  ["anyRecall", "Recall (any rep)", m => m.anyRecall, pct],
  ["flakiness", "Flakiness", m => m.flakiness, pct],
  ["extrasPerRun", "Extras/run", m => m.extrasPerRun, v => fmt(v, 1)],
  ["noBugsCleanRate", "No-bugs clean", m => m.noBugsCleanRate, pct],
  ["latencyMedianSeconds", "Latency med", m => m.latencyMedianSeconds, v => fmt(v, 1, "s")],
  ["latencyP95Seconds", "Latency p95", m => m.latencyP95Seconds, v => fmt(v, 1, "s")],
  ["meanCostPerRun", "Cost/run", m => m.meanCostPerRun, v => v == null ? "–" : "$" + v.toFixed(4)],
  ["failedRuns", "Failed", m => m.failedRuns, v => v || ""],
];
let sortKey = "meanRecall", sortDir = -1, selectedModel = null;

function renderLeaderboard() {
  const thead = document.querySelector("#leaderboard thead");
  thead.innerHTML = "<tr>" + COLUMNS.map(([key, label]) =>
    '<th data-key="' + key + '">' + label + (key === sortKey ? (sortDir < 0 ? " ▼" : " ▲") : "") + "</th>").join("") + "</tr>";
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

function cellFor(model, imageId, rep) {
  return scores.cells.find(c => c.model === model && c.imageId === imageId && c.rep === rep);
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

function renderDetail() {
  const container = document.getElementById("detail");
  if (!selectedModel) { container.innerHTML = ""; return; }
  const reps = Array.from({ length: scores.repeats }, (_, i) => i + 1);
  let html = "<h2>" + selectedModel + "</h2>";
  for (const entry of DATA.manifest) {
    const cells = reps.map(rep => cellFor(selectedModel, entry.imageId, rep));
    if (cells.every(c => !c)) continue;
    html += '<div class="imgcard clearfix"><img src="../../golden_data_set/' + entry.filename + '" alt="' + entry.imageId + '" loading="lazy">';
    html += "<h3>" + entry.imageId + " · " + entry.filename + "</h3>";
    if (entry.expectedIssues.length === 0) html += '<p class="meta">Negative control — no expected issues; anything reported counts as an extra.</p>';
    entry.expectedIssues.forEach((text, expIndex) => {
      html += '<div class="exp-row"><span class="exp-text">' + text + "</span>";
      reps.forEach(rep => {
        const cell = cells[rep - 1];
        if (!cell || cell.status !== "ok") { html += '<span class="chip na" title="no successful run">r' + rep + "</span>"; return; }
        const key = selectedModel + "/" + entry.imageId + "/rep_" + rep;
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
    reps.forEach(rep => {
      const cell = cells[rep - 1];
      if (!cell || cell.status !== "ok") return;
      const key = selectedModel + "/" + entry.imageId + "/rep_" + rep;
      cell.reportedIssues.forEach((issue, repIndex) => {
        const matchedSomewhere = cell.expected.some(e => e.matchedReportedIndexes.includes(repIndex));
        const isExtra = effectiveExtra(cell, repIndex, key);
        if (!isExtra && !matchedSomewhere) return; // matched-by-override leftovers stay visible via chips above
        if (!isExtra) return;
        anyExtras = true;
        const forced = overrides[key] && overrides[key].extras && overrides[key].extras[String(repIndex)];
        html += '<div class="extra-item">rep ' + rep + ": [" + issue.priority + "/" + issue.category + "] " + issue.description +
          ' <span class="chip extra' + (forced ? " overridden" : "") + '" data-kind="extra" data-key="' + key + '" data-index="' + repIndex + '">extra</span></div>';
      });
    });
    if (!anyExtras) html += '<div class="meta" style="margin-left:16px">none</div>';
    html += "</div><details><summary>Raw model summaries</summary>";
    reps.forEach(rep => {
      const cell = cells[rep - 1];
      if (!cell) return;
      html += '<div class="rawsum"><strong>rep ' + rep + (cell.status === "error" ? " (FAILED: " + (cell.error ? cell.error.message : "") + ")" : "") + ":</strong> " + (cell.summary || "") + "</div>";
    });
    html += "</details></div>";
  }
  container.innerHTML = html;
  container.querySelectorAll(".chip[data-kind]").forEach(chip => chip.onclick = () => {
    const { kind, key, index } = chip.dataset;
    const entry = overrideEntry(key);
    if (kind === "expected") {
      entry.expected = entry.expected || {};
      const cell = scores.cells.find(c => key === c.model + "/" + c.imageId + "/rep_" + c.rep);
      const current = effectiveFound(cell, Number(index), key);
      entry.expected[index] = current ? "missed" : "found";
    } else {
      entry.extras = entry.extras || {};
      const cell = scores.cells.find(c => key === c.model + "/" + c.imageId + "/rep_" + c.rep);
      const current = effectiveExtra(cell, Number(index), key);
      entry.extras[index] = current ? "not-extra" : "extra";
    }
    countOverrides();
    renderDetail();
  });
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

renderLeaderboard();
countOverrides();
</script>
</body>
</html>
`;
}
