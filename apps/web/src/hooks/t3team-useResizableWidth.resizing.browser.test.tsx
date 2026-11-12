import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useResizableWidth } from "./useResizableWidth";

let root: Root;
let container: HTMLDivElement;
let captured = false;
let frame: FrameRequestCallback | undefined;
let setItem: ReturnType<typeof vi.spyOn<Storage, "setItem">>;

function Panel({ showHandle = true }: { readonly showHandle?: boolean }) {
  const { width, handlers, resizing } = useResizableWidth({
    storageKey: "test-panel-width",
    defaultWidth: 400,
    minWidth: 200,
    maxWidth: 800,
    edge: "left",
  });
  return (
    <aside data-testid="host">
      <output>{width}</output>
      <span data-testid="resizing">{String(resizing)}</span>
      {showHandle ? <div data-testid="handle" {...handlers} /> : null}
    </aside>
  );
}

const shownWidth = () => Number(container.querySelector("output")!.textContent);
const resizing = () => container.querySelector("[data-testid=resizing]")!.textContent === "true";

function handle() {
  const element = container.querySelector<HTMLElement>("[data-testid=handle]")!;
  // Synthetic pointers have no active pointer for the browser to capture.
  element.setPointerCapture = () => {
    captured = true;
  };
  element.hasPointerCapture = () => captured;
  element.releasePointerCapture = () => {
    captured = false;
  };
  return element;
}

function pointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
  clientX = 100,
) {
  handle().dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX }),
  );
}

function windowPointerUp(pointerId: number, clientX: number) {
  window.dispatchEvent(new PointerEvent("pointerup", { pointerId, clientX }));
}

beforeEach(async () => {
  localStorage.clear();
  captured = false;
  frame = undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 42;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  setItem = vi.spyOn(Storage.prototype, "setItem");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(<Panel />));
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("panel resize state", () => {
  it.each(["release", "cancel", "lost capture", "blur"])(
    "reports an active drag until %s",
    async (reason) => {
      expect(resizing()).toBe(false);
      await act(() => pointer("pointerdown"));
      expect(resizing()).toBe(true);
      await act(() => pointer("pointermove", 50));
      await act(() => frame?.(0));
      expect(resizing()).toBe(true);
      await act(() => {
        if (reason === "release") pointer("pointerup", 50);
        if (reason === "cancel") pointer("pointercancel");
        if (reason === "lost capture") pointer("lostpointercapture");
        if (reason === "blur") window.dispatchEvent(new Event("blur"));
      });
      expect(resizing()).toBe(false);
    },
  );

  it("abandons a drag whose handle unmounted before release", async () => {
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", 50);
    });
    await act(() => frame?.(0));
    expect(resizing()).toBe(true);
    // The handle goes away (panel closed/maximized) mid-drag: its React handlers never fire
    // again, so the drag must end on unmount instead of waiting for a release it cannot see.
    await act(() => root.render(<Panel showHandle={false} />));
    expect(resizing()).toBe(false);
    expect(document.body.style.cursor).toBe("");
    // The width is not committed from a half-finished drag.
    expect(shownWidth()).toBe(400);
    expect(setItem).not.toHaveBeenCalled();
    // A late window release is ignored, and a later grab starts a fresh drag instead of
    // being swallowed by the stale one.
    await act(() => windowPointerUp(1, 25));
    expect(resizing()).toBe(false);
    await act(() => root.render(<Panel />));
    await act(() => pointer("pointerdown"));
    expect(resizing()).toBe(true);
  });

  it("ignores window releases from other pointers", async () => {
    await act(() => pointer("pointerdown"));
    await act(() => windowPointerUp(2, 25));
    expect(resizing()).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
  });
});
