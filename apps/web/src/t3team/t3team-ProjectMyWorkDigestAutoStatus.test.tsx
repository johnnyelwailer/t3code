// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DigestAutoStatus } from "~/t3team/t3team-ProjectMyWorkDigestAutoStatus";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const NOW = Date.parse("2026-10-13T10:00:00.000Z");

describe("DigestAutoStatus refresh hint", () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = (refreshing: boolean) =>
    act(() => {
      root.render(
        <DigestAutoStatus
          updatedAtMs={NOW}
          jiraSyncedAt={new Date(NOW - 180_000).toISOString()}
          nowMs={NOW}
          refreshing={refreshing}
        />,
      );
    });
  const hint = () =>
    [...container.querySelectorAll("span")].find((el) => el.textContent === "Refreshing…");
  const hintVisible = () => hint()?.className.includes("opacity-100") === true;
  const announced = () => container.querySelector("[aria-live]")?.textContent ?? "";
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("keeps the hint's place laid out while nothing is refreshing", () => {
    render(false);

    expect(hint()).toBeDefined();
    expect(hintVisible()).toBe(false);
    expect(announced()).toBe("");
  });

  it("never shows the hint for a round that answers quickly", () => {
    render(true);
    wait(599);
    expect(hintVisible()).toBe(false);
    render(false);
    wait(2000);

    expect(hintVisible()).toBe(false);
    expect(announced()).toBe("");
  });

  it("shows the hint once a round runs past 600 ms and keeps it up long enough to read", () => {
    render(true);
    wait(600);
    expect(hintVisible()).toBe(true);
    expect(announced()).toBe("Refreshing…");

    render(false);
    wait(599);
    expect(hintVisible()).toBe(true);
    wait(1);

    expect(hintVisible()).toBe(false);
    expect(announced()).toBe("");
  });

  it("fades the hint instead of removing it", () => {
    render(false);

    expect(hint()?.className).toContain("transition-opacity");
    expect(hint()?.className).toContain("motion-reduce:transition-none");
  });
});
