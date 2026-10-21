// @vitest-environment jsdom
/**
 * The non-WebGL half of `ModelStage`: jsdom has no WebGL, so the stage must settle on its loop
 * (`minimal`) or its still, never try to load the renderer, and say which tier it chose.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ModelStage } from "./t3team-ModelStage";
import { resetModelStageSignalsForTest } from "./t3team-modelStageSignals";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
let reduced = false;
beforeEach(() => {
  resetModelStageSignalsForTest();
  reduced = false;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? reduced : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sprite = { kind: "sprite", src: "/loop.webp", columns: 8, rows: 5, fps: 12 } as const;
const stage = () => container.querySelector<HTMLElement>("[data-model-stage-tier]")!;

describe("ModelStage without WebGL", () => {
  it("plays the pre-rendered loop when the pack ships one", () => {
    act(() => root.render(<ModelStage src="/m.glb" still="/still.png" loop={sprite} size={120} />));
    expect(stage().dataset.modelStageTier).toBe("minimal");
    expect(stage().dataset.modelStageReasons).toBe("no WebGL");
    expect(stage().style.width).toBe("120px");
    expect(stage().getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the still without a loop, and always under reduced motion", () => {
    act(() => root.render(<ModelStage src="/m.glb" still="/still.png" size={48} />));
    expect(stage().dataset.modelStageTier).toBe("still");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/still.png");

    reduced = true;
    act(() => root.unmount());
    root = createRoot(container);
    act(() =>
      root.render(
        <ModelStage src="/m.glb" still="/still.png" loop={sprite} size={48} label="Mascot" />,
      ),
    );
    expect(stage().dataset.modelStageTier).toBe("still");
    expect(stage().getAttribute("role")).toBe("img");
    expect(stage().getAttribute("aria-label")).toBe("Mascot");
  });

  it("reports the tier it rendered", () => {
    const onTierChange = vi.fn();
    act(() =>
      root.render(
        <ModelStage
          src="/m.glb"
          still="/s.png"
          size={48}
          quality="still"
          onTierChange={onTierChange}
        />,
      ),
    );
    expect(onTierChange).toHaveBeenCalledWith("still");
  });

  it("draws a CSS ground shadow when grounded, and marks flight", () => {
    act(() =>
      root.render(
        <ModelStage src="/m.glb" still="/still.png" loop={sprite} size={120} groundShadow />,
      ),
    );
    expect(container.querySelector("[data-model-stage-shadow]")).not.toBeNull();
    expect(stage().dataset.modelStageFlight).toBeUndefined();

    act(() =>
      root.render(
        <ModelStage
          src="/m.glb"
          still="/still.png"
          loop={sprite}
          size={120}
          groundShadow
          flight={{ lift: 0.06 }}
        />,
      ),
    );
    expect(stage().dataset.modelStageFlight).toBe("1");
    const shadow = container.querySelector<HTMLElement>("[data-model-stage-shadow]");
    expect(shadow).not.toBeNull();
    expect(Number.parseFloat(shadow!.style.opacity)).toBeLessThan(0.55);
  });

  it("becomes a named control that pokes on Enter and on a click", () => {
    const onPoke = vi.fn();
    act(() =>
      root.render(
        <ModelStage
          src="/m.glb"
          still="/s.png"
          loop={sprite}
          size={120}
          interaction={{ label: "Mascot, press Enter to poke", onPoke }}
        />,
      ),
    );
    const el = stage();
    expect(el.getAttribute("role")).toBe("button");
    expect(el.tabIndex).toBe(0);
    expect(el.getAttribute("aria-hidden")).toBeNull();
    expect(el.getAttribute("aria-label")).toBe("Mascot, press Enter to poke");
    act(() => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    act(() => {
      el.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }),
      );
      el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 11, clientY: 10 }));
    });
    expect(onPoke).toHaveBeenCalledTimes(2);
  });

  it("picks up on a drag instead of poking, and lands after the drop", () => {
    vi.useFakeTimers();
    const onPoke = vi.fn();
    const onHeldChange = vi.fn();
    act(() =>
      root.render(
        <ModelStage
          src="/m.glb"
          still="/s.png"
          loop={sprite}
          size={120}
          interaction={{ label: "Mascot", onPoke, draggable: true, onHeldChange }}
        />,
      ),
    );
    const el = stage();
    act(() => {
      el.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }),
      );
      el.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 60, clientY: 50 }));
    });
    expect(el.dataset.modelStageHeld).toBe("1");
    expect(onHeldChange).toHaveBeenLastCalledWith(true);
    expect(el.style.transform).toBe("translate(50px, 40px)");
    act(() => {
      el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 60, clientY: 50 }));
    });
    expect(onPoke).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("translate(50px, 0px)");
    act(() => vi.advanceTimersByTime(500));
    expect(onHeldChange).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });
});
