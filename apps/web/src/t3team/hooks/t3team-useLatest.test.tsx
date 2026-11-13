/* oxlint-disable t3code/no-dom-test-environment -- The helper's identity and freshness need a DOM render. */
/* oxlint-disable t3code/require-disposable-render -- Custom root so identity can be compared across renders. */
/* oxlint-disable react/immutability -- The identity bag lives outside the tree so a test can compare refs across renders. */
// @vitest-environment jsdom
import { act, createElement, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { useLatest, useLatestCallback } from "./t3team-useLatest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(element: ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root!.render(element);
  });
}

describe("useLatest", () => {
  it("the ref is the latest value after a re-render, and the ref object is stable", () => {
    const seen: { ref: { current: number } | null; values: number[] } = { ref: null, values: [] };
    function Host({ value }: { value: number }) {
      const latest = useLatest(value);
      seen.values.push(latest.current);
      if (seen.ref === null) seen.ref = latest;
      else expect(latest).toBe(seen.ref);
      return null;
    }
    mount(createElement(Host, { value: 1 }));
    act(() => {
      root!.render(createElement(Host, { value: 2 }));
    });
    expect(seen.values).toEqual([1, 2]);
    expect(seen.ref?.current).toBe(2);
  });
});

describe("useLatestCallback", () => {
  it("keeps a stable identity and calls the latest closure", () => {
    const seen: { fn: ((n: number) => number) | null; results: number[] } = { fn: null, results: [] };
    function Host({ factor }: { factor: number }) {
      const [n, setN] = useState(0);
      const cb = useLatestCallback((value: number) => value * factor);
      if (seen.fn === null) seen.fn = cb;
      else expect(cb).toBe(seen.fn);
      return createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            seen.results.push(cb(3));
            setN((prev) => prev + 1);
          },
          "data-n": n,
        },
        "go",
      );
    }
    mount(createElement(Host, { factor: 2 }));
    const click = () =>
      act(() => {
        host!.querySelector("button")?.click();
      });
    click();
    act(() => {
      root!.render(createElement(Host, { factor: 5 }));
    });
    click();
    expect(seen.results).toEqual([6, 15]);
  });
});
