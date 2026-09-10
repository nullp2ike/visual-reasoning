import { buildStatementPivot } from "./pivot.js";
import type { VisibilityScores } from "./types.js";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Build the self-contained visibility report. All scores are inlined as JSON,
 * so the page works from the filesystem with no server and no network.
 *
 * The centrepiece is the consistency grid: one row per (image, element), one
 * column per model, each cell counting how many reps answered that element
 * correctly. A benchmark run at several reps is mostly interesting where the
 * count is neither 0 nor N, because that is the model disagreeing with itself
 * on identical input — invisible in any single-rep view and in any average.
 *
 * Screenshots are linked relative to the report rather than inlined, via
 * `imageBase`, so the page stays small and the dataset stays out of it.
 */
export function buildVisibilityReportHtml(scores: VisibilityScores, imageBase: string): string {
  const payload = {
    scores,
    pivot: buildStatementPivot(scores),
    imageBase: imageBase.replace(/\/+$/, ""),
  };
  // "</script>" inside the JSON would end the script block early.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const modelCount = scores.models.length;
  const repCount = Math.max(
    0,
    ...scores.models.map((m) => m.okRuns + m.failedRuns + m.invalidRuns),
  );
  const perImage = scores.images.length > 0 ? repCount / scores.images.length : 0;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Assertion accuracy benchmark — ${escapeHtml(scores.dataset)}</title>
<style>
  :root { --ok:#15803d; --bad:#b91c1c; --warn:#b45309; --muted:#6b7280; --line:#e5e7eb; --accent:#1d4ed8; }
  * { box-sizing: border-box; }
  body { font:14px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif; margin:0; color:#111827; background:#fafafa; }
  main { max-width:1400px; margin:0 auto; padding:24px; }
  h1 { font-size:22px; margin-bottom:4px; } h2 { font-size:18px; margin-top:34px; } h3 { font-size:15px; }
  .hero { background:#eef2ff; border:1px solid #c7d2fe; border-radius:8px; padding:14px 18px; margin:12px 0; }
  .hero b { font-size:16px; }
  .meta { color:var(--muted); font-size:12px; margin-bottom:14px; }
  .meta code, .hero code { background:#e0e7ff; padding:1px 4px; border-radius:3px; }
  .warn { background:#fef3c7; border:1px solid #fcd34d; color:#78350f; border-radius:6px; padding:8px 12px; margin:10px 0; }
  table { border-collapse:collapse; width:100%; background:#fff; }
  th,td { border:1px solid var(--line); padding:6px 10px; text-align:right; white-space:nowrap; }
  th { background:#f3f4f6; position:sticky; top:0; z-index:2; }
  th:first-child, td:first-child { text-align:left; }
  .num { font-variant-numeric:tabular-nums; }
  /* Matrix + grid cells */
  td.cell { cursor:pointer; font-variant-numeric:tabular-nums; }
  td.cell:hover { outline:2px solid var(--accent); outline-offset:-2px; }
  td.cell.open { outline:2px solid var(--accent); outline-offset:-2px; }
  .c-all { background:#dcfce7; color:#14532d; }
  .c-none { background:#fee2e2; color:#7f1d1d; }
  .c-mixed { background:#fef9c3; color:#713f12; font-weight:600; }
  .c-na { background:#f9fafb; color:var(--muted); }
  /* Per-statement pivot */
  #pivot td:first-child { white-space:normal; max-width:520px; }
  /* Consistency grid */
  #grid td:first-child { white-space:normal; max-width:520px; }
  #grid tr.imghead td { background:#eef2ff; font-weight:600; color:#3730a3; }
  .badge { display:inline-block; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.02em; border-radius:3px; padding:0 5px; margin-left:6px; vertical-align:1px; }
  .b-vis { background:#dbeafe; color:#1e40af; }
  .b-hid { background:#ede9fe; color:#5b21b6; }
  .b-on  { background:#dcfce7; color:#14532d; }
  .b-off { background:#fee2e2; color:#7f1d1d; }
  .filters { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin:10px 0; font-size:13px; }
  .filters label { display:inline-flex; align-items:center; gap:5px; background:#eef2ff; border:1px solid #c7d2fe; border-radius:6px; padding:3px 9px; cursor:pointer; user-select:none; }
  .legend { font-size:12px; color:var(--muted); margin:6px 0 12px; }
  .legend span { display:inline-block; border-radius:3px; padding:1px 7px; margin-right:8px; }
  /* Drill-down */
  tr.detail td { text-align:left; white-space:normal; background:#f8fafc; padding:14px 18px; }
  .exp { display:flex; gap:18px; align-items:flex-start; }
  .exp-main { flex:1 1 auto; min-width:0; }
  .exp-shot { flex:0 0 300px; position:sticky; top:8px; }
  .exp-shot img { width:100%; border:1px solid var(--line); border-radius:4px; background:#fff; display:block; }
  .exp-shot .cap { color:var(--muted); font-size:12px; margin-top:6px; word-break:break-all; }
  @media (max-width:760px){ .exp{flex-direction:column-reverse;} .exp-shot{position:static;flex-basis:auto;width:100%;max-width:340px;} }
  .rep { border:1px solid var(--line); border-radius:6px; background:#fff; padding:8px 12px; margin:8px 0; }
  .rep .hdr { font-weight:600; margin-bottom:2px; }
  .rep .why { color:#374151; }
  .tick { color:var(--ok); font-weight:700; } .cross { color:var(--bad); font-weight:700; }
  .empty { color:var(--muted); font-style:italic; padding:10px 0; }
</style>
</head>
<body>
<main>
<h1>Assertion accuracy benchmark</h1>
<div class="meta">Dataset <code>${escapeHtml(scores.dataset)}</code> ·
  ${scores.images.length} image(s) · ${modelCount} model(s) ·
  ${perImage % 1 === 0 ? perImage : perImage.toFixed(1)} rep(s) per image ·
  generated ${escapeHtml(scores.generatedAt)}</div>

<div class="hero">
  <b>Grading is deterministic.</b> Elements under <code>### visible</code> are asked with
  <code>elementsVisible()</code>, those under <code>### absent</code> with <code>elementsHidden()</code>.
  Every answer is normalised to &ldquo;is it on screen?&rdquo; and compared with the ground truth,
  so there is no judge.
</div>
${scores.staleRecords > 0 ? `<div class="warn"><b>${scores.staleRecords} stale record(s) ignored.</b> The dataset changed since they were produced. Re-run <code>pnpm assertion:run</code>.</div>` : ""}

<h2>Leaderboard</h2>
<table id="leaderboard"><thead></thead><tbody></tbody></table>

<h2>Image &times; model</h2>
<div class="legend">Cell: reps in which <em>every</em> element was correct / successful reps, then mean element accuracy. Click to inspect.</div>
<table id="matrix"><thead></thead><tbody></tbody></table>

<h2>Per-statement pivot</h2>
<div class="legend">Cell: files with at least one wrong rep / files the statement was graded in. Worst wording first.
  A statement failing across many files is the wording; one failing on a single file is the model, or that file&rsquo;s label. Click a cell to list the files.</div>
<table id="pivot"><thead></thead><tbody></tbody></table>

<h2>Consistency grid</h2>
<div class="legend">
  <span class="c-all">5/5</span>correct in every rep
  <span class="c-mixed">3/5</span>inconsistent, the model disagreed with itself
  <span class="c-none">0/5</span>wrong in every rep
</div>
<div class="filters">
  <label><input type="checkbox" id="f-dis"> Only rows with at least one wrong answer</label>
  <label><input type="checkbox" id="f-mix"> Only inconsistent rows</label>
  <label><input type="checkbox" id="f-hid"> Only the <code>elementsHidden</code> prompt</label>
</div>
<table id="grid"><thead></thead><tbody></tbody></table>
</main>

<script id="data" type="application/json">${json}</script>
<script>
const DATA = JSON.parse(document.getElementById("data").textContent);
const S = DATA.scores;
const SERIES = S.models.map(m => m.series);

// cellsBy[series][filename] = [rep cells...]
const cellsBy = {};
for (const c of S.cells) {
  (cellsBy[c.series] ||= {});
  (cellsBy[c.series][c.filename] ||= []).push(c);
}
for (const s of Object.values(cellsBy))
  for (const list of Object.values(s)) list.sort((a, b) => a.rep - b.rep);

const esc = t => String(t ?? "").replace(/[&<>"]/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[ch]));
const pct = v => v === null || v === undefined ? "–" : (100 * v).toFixed(0) + "%";
const num = (v, d, suf) => v === null || v === undefined ? "–" : v.toFixed(d) + (suf || "");
const money = v => v === null || v === undefined ? "–" : "$" + v.toFixed(4);

/* ---------- leaderboard ---------- */
const LB = [
  ["Model", m => esc(m.series)], ["Provider", m => esc(m.provider)],
  ["Accuracy", m => pct(m.accuracy)], ["Present recall", m => pct(m.presentRecall)],
  ["Absent acc.", m => pct(m.absentAccuracy)],
  ["Halluc.", m => m.absentAccuracy === null ? "–" : pct(1 - m.absentAccuracy)],
  ["Visible prompt", m => pct(m.visiblePromptAccuracy)],
  ["Hidden prompt", m => pct(m.hiddenPromptAccuracy)],
  ["All-correct", m => pct(m.allCorrectRate)], ["Flakiness", m => pct(m.flakiness)],
  ["Latency med", m => num(m.latencyMedianSeconds, 1, "s")],
  ["Cost/rep", m => money(m.meanCostPerRun)], ["Total", m => money(m.totalCost)],
  ["Failed", m => m.failedRuns || ""], ["Invalid", m => m.invalidRuns || ""],
];
document.querySelector("#leaderboard thead").innerHTML =
  "<tr>" + LB.map(c => "<th>" + c[0] + "</th>").join("") + "</tr>";
document.querySelector("#leaderboard tbody").innerHTML =
  S.models.map(m => "<tr>" + LB.map(c => "<td>" + c[1](m) + "</td>").join("") + "</tr>").join("");

/* ---------- shared helpers ---------- */
function okCells(series, filename) {
  return (cellsBy[series]?.[filename] || []).filter(c => c.status === "ok");
}
function shade(correct, total) {
  if (!total) return "c-na";
  if (correct === total) return "c-all";
  if (correct === 0) return "c-none";
  return "c-mixed";
}
/** Close any open drill-down row, and report whether it belonged to this cell. */
function toggleDetail(td, buildHtml) {
  const open = td.classList.contains("open");
  document.querySelectorAll("tr.detail").forEach(r => r.remove());
  document.querySelectorAll("td.cell.open").forEach(c => c.classList.remove("open"));
  if (open) return;
  td.classList.add("open");
  const tr = td.closest("tr");
  const row = document.createElement("tr");
  row.className = "detail";
  const cellEl = document.createElement("td");
  cellEl.colSpan = tr.children.length;
  cellEl.innerHTML = buildHtml();
  row.appendChild(cellEl);
  tr.after(row);
}
function shotHtml(filename) {
  const src = DATA.imageBase + "/" + filename;
  return '<div class="exp-shot"><img src="' + esc(src) + '" alt="' + esc(filename) + '">' +
    '<div class="cap">' + esc(filename) + "</div></div>";
}

/* ---------- image x model matrix ---------- */
document.querySelector("#matrix thead").innerHTML =
  "<tr><th>Image</th><th>Elements</th>" + SERIES.map(s => "<th>" + esc(s) + "</th>").join("") + "</tr>";
document.querySelector("#matrix tbody").innerHTML = S.images.map(img => {
  const absent = img.elements.length - img.expectedVisible.length;
  const tds = SERIES.map(series => {
    const ok = okCells(series, img.filename);
    if (!ok.length) return '<td class="cell c-na">–</td>';
    const all = ok.filter(c => c.allCorrect).length;
    const answers = ok.flatMap(c => c.elements);
    const acc = answers.length ? answers.filter(e => e.correct).length / answers.length : null;
    return '<td class="cell ' + shade(all, ok.length) + '" data-f="' + esc(img.filename) +
      '" data-s="' + esc(series) + '">' + all + "/" + ok.length + " · " + pct(acc) + "</td>";
  }).join("");
  return "<tr><td><b>" + esc(img.filename) + "</b></td><td class=\\"num\\">" +
    img.expectedVisible.length + " on / " + absent + " off</td>" + tds + "</tr>";
}).join("");

document.querySelector("#matrix tbody").addEventListener("click", ev => {
  const td = ev.target.closest("td.cell");
  if (!td || !td.dataset.f) return;
  toggleDetail(td, () => {
    const ok = okCells(td.dataset.s, td.dataset.f);
    const wrong = new Map();
    for (const c of ok) for (const e of c.elements) {
      if (!e.correct) {
        if (!wrong.has(e.element)) wrong.set(e.element, []);
        wrong.get(e.element).push(c.rep);
      }
    }
    const body = wrong.size === 0
      ? '<div class="empty">Every element correct in all ' + ok.length + " rep(s).</div>"
      : [...wrong.entries()].map(([el, reps]) =>
          '<div class="rep"><div class="hdr"><span class="cross">✗</span> ' + esc(el) +
          '</div><div class="why">wrong in rep ' + reps.join(", ") + " of " + ok.length + "</div></div>").join("");
    return '<div class="exp"><div class="exp-main"><h3>' + esc(td.dataset.s) + " · " +
      esc(td.dataset.f) + "</h3>" + body + "</div>" + shotHtml(td.dataset.f) + "</div>";
  });
});

/* ---------- per-statement pivot ---------- */
const PIVOT = DATA.pivot;
document.querySelector("#pivot thead").innerHTML =
  "<tr><th>Statement</th><th>Asked</th>" + SERIES.map(s => "<th>" + esc(s) + "</th>").join("") + "</tr>";
document.querySelector("#pivot tbody").innerHTML = PIVOT.length === 0
  ? '<tr><td colspan="' + (2 + SERIES.length) + '" class="empty">No graded runs.</td></tr>'
  : PIVOT.map((row, i) => {
      const asked = row.askedAs.map(m =>
        '<span class="badge ' + (m === "visible" ? "b-vis" : "b-hid") + '">' +
        (m === "visible" ? "is it visible?" : "is it hidden?") + "</span>").join(" ");
      const tds = SERIES.map(s => {
        const c = row.cells[s];
        if (!c || !c.files) return '<td class="cell c-na">–</td>';
        return '<td class="cell ' + shade(c.files - c.failingFiles, c.files) + '" data-i="' + i +
          '" data-s="' + esc(s) + '">' + c.failingFiles + "/" + c.files + "</td>";
      }).join("");
      return "<tr><td>" + esc(row.statement) + "</td><td>" + asked + "</td>" + tds + "</tr>";
    }).join("");

document.querySelector("#pivot tbody").addEventListener("click", ev => {
  const td = ev.target.closest("td.cell");
  if (!td || td.dataset.i === undefined) return;
  toggleDetail(td, () => {
    const row = PIVOT[Number(td.dataset.i)];
    const c = row.cells[td.dataset.s];
    const items = c.failing.length === 0
      ? '<div class="empty">Correct in every rep, in every file.</div>'
      : c.failing.map(f =>
          '<div class="rep"><div class="hdr">' + esc(f.filename) + '</div><div class="why">' +
          f.correct + "/" + f.total + " reps correct</div></div>").join("");
    return '<div class="exp"><div class="exp-main"><h3>' + esc(row.statement) + '</h3><div class="meta">' +
      esc(td.dataset.s) + "</div>" + items + "</div></div>";
  });
});

/* ---------- consistency grid ---------- */
document.querySelector("#grid thead").innerHTML =
  "<tr><th>Element</th><th>Asked</th><th>Expected</th>" +
  SERIES.map(s => "<th>" + esc(s) + "</th>").join("") + "</tr>";

function gridRows() {
  const rows = [];
  for (const img of S.images) {
    const expected = new Set(img.expectedVisible);
    const visCall = new Set(img.visibleCall);
    const perImage = [];
    for (const el of img.elements) {
      const counts = SERIES.map(series => {
        const ok = okCells(series, img.filename);
        const hits = ok.map(c => c.elements.find(e => e.element === el)).filter(Boolean);
        return { correct: hits.filter(h => h.correct).length, total: hits.length };
      });
      perImage.push({
        filename: img.filename, element: el,
        asked: visCall.has(el) ? "visible" : "hidden",
        expected: expected.has(el), counts,
      });
    }
    rows.push({ image: img.filename, items: perImage });
  }
  return rows;
}
const ROWS = gridRows();

function renderGrid() {
  const onlyDis = document.getElementById("f-dis").checked;
  const onlyMix = document.getElementById("f-mix").checked;
  const onlyHid = document.getElementById("f-hid").checked;
  const span = 3 + SERIES.length;
  let html = "", shown = 0;
  for (const group of ROWS) {
    const items = group.items.filter(it => {
      if (onlyHid && it.asked !== "hidden") return false;
      const anyWrong = it.counts.some(c => c.total && c.correct < c.total);
      const anyMixed = it.counts.some(c => c.total && c.correct > 0 && c.correct < c.total);
      if (onlyMix) return anyMixed;
      if (onlyDis) return anyWrong;
      return true;
    });
    if (!items.length) continue;
    shown += items.length;
    html += '<tr class="imghead"><td colspan="' + span + '">' + esc(group.image) + "</td></tr>";
    for (const it of items) {
      const cells = it.counts.map(c => c.total
        ? '<td class="cell ' + shade(c.correct, c.total) + '" data-f="' + esc(it.filename) +
          '" data-e="' + esc(it.element) + '">' + c.correct + "/" + c.total + "</td>"
        : '<td class="cell c-na">–</td>').join("");
      html += "<tr><td>" + esc(it.element) + "</td>" +
        '<td><span class="badge ' + (it.asked === "visible" ? "b-vis" : "b-hid") + '">' +
        (it.asked === "visible" ? "is it visible?" : "is it hidden?") + "</span></td>" +
        '<td><span class="badge ' + (it.expected ? "b-on" : "b-off") + '">' +
        (it.expected ? "on screen" : "not on screen") + "</span></td>" + cells + "</tr>";
    }
  }
  document.querySelector("#grid tbody").innerHTML =
    html || '<tr><td colspan="' + span + '" class="empty">No rows match the filters.</td></tr>';
  document.querySelector("#grid").dataset.shown = shown;
}
["f-dis", "f-mix", "f-hid"].forEach(id =>
  document.getElementById(id).addEventListener("change", renderGrid));
renderGrid();

document.querySelector("#grid tbody").addEventListener("click", ev => {
  const td = ev.target.closest("td.cell");
  if (!td || !td.dataset.e) return;
  toggleDetail(td, () => {
    const series = SERIES[[...td.parentElement.children].indexOf(td) - 3];
    const ok = okCells(series, td.dataset.f);
    const reps = ok.map(c => {
      const e = c.elements.find(x => x.element === td.dataset.e);
      if (!e) return "";
      return '<div class="rep"><div class="hdr">rep ' + c.rep + " · " +
        (e.correct ? '<span class="tick">✓ correct</span>' : '<span class="cross">✗ wrong</span>') +
        " · model said <b>" + (e.answeredVisible ? "on screen" : "not on screen") + "</b>" +
        (e.confidence ? " · confidence " + esc(e.confidence) : "") +
        '</div><div class="why">' + esc(e.reasoning) + "</div></div>";
    }).join("");
    return '<div class="exp"><div class="exp-main"><h3>' + esc(td.dataset.e) + "</h3>" +
      "<div class=\\"meta\\">" + esc(series) + " · " + esc(td.dataset.f) + "</div>" + reps +
      "</div>" + shotHtml(td.dataset.f) + "</div>";
  });
});
</script>
</body>
</html>
`;
}
