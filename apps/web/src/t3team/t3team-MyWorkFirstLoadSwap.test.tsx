// @vitest-environment jsdom
/**
 * The greeting's timing on screen: no flash for a fast load, a minimum dwell once shown, a
 * cross-fade in one box, and a continued greeting across a remount (startup gate → My Work).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/t3team/packs/t3team-CompanionSlot", () => ({
  T3TeamCompanionSlot: ({ fallback }: { fallback: unknown }) => fallback,
}));

const { MyWorkFirstLoadSwap } = await import("~/t3team/t3team-MyWorkFirstLoadSwap");
const { CROSS_FADE_MS, MIN_VISIBLE_MS, REVEAL_DELAY_MS, resetFirstLoadSessionForTests } =
  await import("~/t3team/t3team-myWorkFirstLoadReveal");

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(0);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  resetFirstLoadSessionForTests();
});

const render = (loading: boolean) =>
  act(() =>
    root.render(
      <MyWorkFirstLoadSwap loading={loading}>{loading ? null : <p>digest</p>}</MyWorkFirstLoadSwap>,
    ),
  );
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const greeting = () => container.querySelector("[data-first-load-greeting]");

describe("MyWorkFirstLoadSwap", () => {
  it("never shows the greeting when the content lands inside the reveal delay", () => {
    render(true);
    expect(greeting()?.getAttribute("data-first-load-greeting")).toBe("pending");
    expect(greeting()?.className).toContain("invisible");
    advance(REVEAL_DELAY_MS - 50);
    render(false);
    expect(greeting()).toBeNull();
    expect(container.textContent).toContain("digest");
  });

  it("reveals after the delay and keeps the greeting for its minimum dwell", () => {
    render(true);
    advance(REVEAL_DELAY_MS);
    expect(greeting()?.getAttribute("data-first-load-greeting")).toBe("shown");
    advance(50);
    render(false);
    // Arrived 50 ms after the reveal: the greeting stays, the content waits.
    expect(container.textContent).not.toContain("digest");
    advance(MIN_VISIBLE_MS - 50);
    // Cross-fade: content in the flow, the greeting pinned over it on its way out.
    expect(container.textContent).toContain("digest");
    const leaving = container.querySelector(".t3team-mywork-first-load-greeting-out");
    expect(leaving?.className).toContain("absolute");
    expect(leaving?.getAttribute("aria-hidden")).toBe("true");
    advance(CROSS_FADE_MS);
    expect(greeting()).toBeNull();
  });

  it("continues a greeting another mount revealed, without replaying its entrance", () => {
    render(true);
    advance(REVEAL_DELAY_MS + 100);
    act(() => root.unmount());
    root = createRoot(container);
    render(false);
    // Same greeting, still inside its dwell: shown at once, marked as continued.
    expect(greeting()?.getAttribute("data-first-load-greeting")).toBe("shown");
    expect(greeting()?.className).toContain("t3team-mywork-loading-continued");
    expect(container.textContent).not.toContain("digest");
    advance(MIN_VISIBLE_MS);
    expect(container.textContent).toContain("digest");
  });
});
