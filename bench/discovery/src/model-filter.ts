/**
 * The "Models" filter shared by every judge's report and the comparison page:
 * a collapsed button whose dropdown switches models on and off.
 *
 * The selection is stored once per browser tab (sessionStorage), scoped to the
 * results directory, so every page there applies it however the reader got to
 * that page: a link, the back/forward buttons (a page restored from the
 * back-forward cache re-reads it on `pageshow`), or the comparison page's link
 * back to the report. An untouched filter stores nothing, and every page shows
 * its default: the same models in every report, chosen at build time.
 */

export interface ModelFilterConfig {
  /** Every model on the page, in display order. */
  series: readonly string[];
  /** Short text shown beside each model, e.g. its recall ("94%"). */
  labels: Record<string, string>;
  /** Models shown until the reader changes the selection; null shows all. */
  defaults: readonly string[] | null;
  /** The judge whose ranking chose the defaults, named on the reset button. */
  defaultJudge: string | null;
}

export const MODEL_FILTER_CSS = `
  /* A compact button; the list opens as a dropdown over the page instead of pushing it down. */
  .model-filter { position: relative; display: inline-block; font-size: 13px; color: #374151; margin: 0 0 10px; }
  .model-filter summary { cursor: pointer; font-weight: 600; color: #3730a3; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 3px 10px; list-style: none; user-select: none; }
  .model-filter summary::-webkit-details-marker { display: none; }
  .model-filter summary::after { content: " ▾"; }
  .model-filter[open] summary::after { content: " ▴"; }
  .model-filter .mf-panel { position: absolute; top: calc(100% + 4px); left: 0; z-index: 20; width: min(760px, calc(100vw - 48px)); max-height: 60vh; overflow: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 8px 24px rgba(17, 24, 39, 0.15); padding: 8px 12px; }
  .model-filter .mf-actions { display: flex; gap: 8px; margin: 0 0 8px; }
  .model-filter .mf-actions button { background: #eef2ff; color: #3730a3; border: 1px solid #c7d2fe; border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
  .model-filter .mf-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 2px 16px; }
  .model-filter .mf-opt { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
  .model-filter .mf-label { color: #6b7280; font-variant-numeric: tabular-nums; margin-left: auto; }
`;

export const MODEL_FILTER_MARKUP =
  '<details id="model-filter" class="model-filter"><summary></summary>' +
  '<div class="mf-panel"><div class="mf-actions"></div><div class="mf-list"></div></div></details>';

/**
 * Client-side factory, inlined into a page's script. `createModelFilter(config)`
 * returns `{ has(series), onChange(listener), render() }`; listeners run after
 * every change, including a selection re-read when the page is restored.
 */
export const MODEL_FILTER_SCRIPT = `
function createModelFilter(config) {
  const ALL = config.series;
  const known = (config.defaults || []).filter(s => ALL.includes(s));
  const DEFAULT = known.length > 0 ? known : ALL;
  const KEY = "discovery-model-filter:" + location.pathname.replace(/[^/]*$/, "");
  const listeners = [];
  const escText = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  function stored() {
    try {
      const raw = sessionStorage.getItem(KEY);
      const parsed = raw === null ? null : JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(s => ALL.includes(s)) : null;
    } catch (e) { return null; }
  }
  let visible = new Set(stored() || DEFAULT);
  const isDefault = () => visible.size === DEFAULT.length && DEFAULT.every(s => visible.has(s));
  function save() {
    try {
      if (isDefault()) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, JSON.stringify([...visible]));
    } catch (e) { /* storage unavailable: the selection just won't follow to other pages */ }
  }
  function notify() { render(); listeners.forEach(f => f()); }
  function set(next) { visible = new Set(next); save(); notify(); }
  function render() {
    const el = document.getElementById("model-filter");
    if (!el) return;
    el.querySelector("summary").textContent = "Models: " + visible.size + " of " + ALL.length + " shown";
    const defaultLabel = config.defaultJudge
      ? "Top " + DEFAULT.length + " by " + config.defaultJudge + " recall"
      : "Default";
    el.querySelector(".mf-actions").innerHTML =
      '<button type="button" data-mf="default">' + escText(defaultLabel) + "</button>" +
      '<button type="button" data-mf="all">All</button><button type="button" data-mf="none">None</button>';
    el.querySelector(".mf-list").innerHTML = ALL.map(s =>
      '<label class="mf-opt"><input type="checkbox" data-series="' + escText(s) + '"' + (visible.has(s) ? " checked" : "") + "> " +
      escText(s) + ' <span class="mf-label">' + escText(config.labels[s] || "") + "</span></label>").join("");
    el.querySelectorAll("button[data-mf]").forEach(b => b.onclick = () => {
      const which = b.dataset.mf;
      set(which === "all" ? ALL : which === "none" ? [] : DEFAULT);
    });
    el.querySelectorAll("input[data-series]").forEach(cb => cb.onchange = () => {
      const next = new Set(visible);
      if (cb.checked) next.add(cb.dataset.series); else next.delete(cb.dataset.series);
      set(next);
    });
  }
  // A page restored from the back-forward cache keeps its old DOM; re-read the
  // selection, which another page may have changed since.
  window.addEventListener("pageshow", e => {
    if (!e.persisted) return;
    visible = new Set(stored() || DEFAULT);
    notify();
  });
  // Close the dropdown on a click outside it or on Escape. composedPath() is
  // fixed at dispatch, so clicks on controls the panel re-renders count as inside.
  document.addEventListener("click", e => {
    const el = document.getElementById("model-filter");
    if (el && el.open && !e.composedPath().includes(el)) el.open = false;
  });
  document.addEventListener("keydown", e => {
    const el = document.getElementById("model-filter");
    if (e.key === "Escape" && el && el.open) el.open = false;
  });
  return { has: s => visible.has(s), onChange: f => listeners.push(f), render };
}
`;
