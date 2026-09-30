import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  MODEL_FILTER_SCRIPT,
  type ModelFilterConfig,
} from "../../../bench/discovery/src/model-filter.js";

interface ModelFilter {
  has(series: string): boolean;
  onChange(listener: () => void): void;
}

/** One tab's sessionStorage, shared by every page loaded in it. */
function tabStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => {
      data.clear();
    },
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

/**
 * Load the filter as a page would, with just enough of a browser around it:
 * no DOM (render is a no-op without #model-filter), a shared sessionStorage,
 * and a way to fire `pageshow` as a back-forward-cache restore does.
 */
function loadPage(storage: Storage, pathname = "/visual-reasoning/report.a.html") {
  const pageshow: ((e: { persisted: boolean }) => void)[] = [];
  const context = {
    sessionStorage: storage,
    location: { pathname },
    document: { getElementById: () => null, addEventListener: () => undefined },
    window: {
      addEventListener: (type: string, f: (e: { persisted: boolean }) => void) => {
        if (type === "pageshow") pageshow.push(f);
      },
    },
  };
  const config: ModelFilterConfig = {
    series: ["a", "b", "c", "d"],
    labels: {},
    defaults: ["a", "b"],
    defaultJudge: "gpt-6-luna",
  };
  const filter = runInNewContext(
    `${MODEL_FILTER_SCRIPT}\ncreateModelFilter(${JSON.stringify(config)})`,
    context,
  ) as ModelFilter;
  const shown = () => config.series.filter((s) => filter.has(s));
  const restoreFromCache = () => {
    for (const f of pageshow) f({ persisted: true });
  };
  return { filter, shown, restoreFromCache };
}

/** Drive a selection change the way the dropdown's "All" button does. */
function clickAll(storage: Storage, pathname = "/visual-reasoning/report.a.html") {
  const key = `discovery-model-filter:${pathname.replace(/[^/]*$/, "")}`;
  storage.setItem(key, JSON.stringify(["a", "b", "c", "d"]));
}

describe("model filter selection", () => {
  it("shows the default models until the reader changes anything", () => {
    expect(loadPage(tabStorage()).shown()).toEqual(["a", "b"]);
  });

  it("applies a selection made on one page when another page loads", () => {
    const storage = tabStorage();
    loadPage(storage);
    clickAll(storage);
    expect(loadPage(storage, "/visual-reasoning/report.b.html").shown()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("re-applies the current selection when the back button restores a cached page", () => {
    const storage = tabStorage();
    const pageA = loadPage(storage);
    let changes = 0;
    pageA.filter.onChange(() => changes++);
    // The reader moves to another judge, changes the selection there, and comes back.
    clickAll(storage);
    pageA.restoreFromCache();
    expect(pageA.shown()).toEqual(["a", "b", "c", "d"]);
    expect(changes).toBe(1);
  });

  it("keeps selections apart for different results directories", () => {
    const storage = tabStorage();
    clickAll(storage, "/results/golden/discovery/report.html");
    expect(loadPage(storage, "/results/primary/discovery/report.html").shown()).toEqual(["a", "b"]);
  });

  it("falls back to the defaults when storage is unavailable", () => {
    const broken: Storage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
    expect(loadPage(broken).shown()).toEqual(["a", "b"]);
  });
});
