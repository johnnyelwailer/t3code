// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { T3TeamNexploreStripArt } from "./t3team-NexploreStageArt";

/**
 * Regression: the t3team sidebar header renders a pack-background layer above the stage backdrop
 * (`absolute inset-0`, `pointer-events-none`, transparent by default). It spans the whole header,
 * so when the placement measured every child box it read the entire header as occupied — the gap
 * collapsed to zero and the orb sank off the strip, i.e. it was never visible. The story's
 * stand-in header originally lacked that layer, which is how the defect survived review.
 *
 * The DOM below mirrors `t3team-ProjectSidebarHeader` exactly: header > backdrop > svg, plus the
 * pack layer, the brand row, and the trailing toggle.
 */

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type Box = { left: number; right: number; width: number; height: number; top: number; bottom: number };

/** toJSON is part of the DOMRect contract, so every stored rect carries it. */
function toRect(box: Box) {
  return { ...box, x: box.left, y: box.top, toJSON: () => box };
}

const rectStore = new Map<Element, ReturnType<typeof toRect>>();
let originalGetBoundingClientRect: Element["getBoundingClientRect"] | null = null;

beforeAll(() => {
  globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  // The component measures its own <svg> via getBoundingClientRect, which jsdom reports as zero
  // (no layout engine). The svg fills its container (`h-full w-full`), so it inherits the
  // container's stored rect.
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (rectStore.has(this)) return rectStore.get(this)!;
    if (this instanceof SVGSVGElement) {
      const parent = this.parentElement;
      if (parent && rectStore.has(parent)) return rectStore.get(parent)!;
    }
    return toRect({ left: 0, right: 0, width: 0, height: 0, top: 0, bottom: 0 });
  };
});

afterAll(() => {
  if (originalGetBoundingClientRect) Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

type Rect = { left: number; right: number; width: number; height: number; top: number; bottom: number };

function withRect(element: Element, box: Box): Element {
  rectStore.set(element, toRect(box));
  return element;
}

interface HeaderLayout {
  width: number;
  brand: [number, number];
  toggle: [number, number];
}

/** viewBox height is 96 and the backdrop is 80px tall, so `unitsPerPx` is 1.2. */
function expectedOrb({ brand, toggle }: HeaderLayout) {
  const gapStart = brand[1];
  const gapEnd = toggle[0];
  const gapWidth = gapEnd - gapStart;
  const unitsPerPx = 96 / 80;
  const roomy = 2 * (46 + 12);
  const tight = 2 * 46;
  const sink = Math.max(0, Math.min(1, (roomy - gapWidth) / (roomy - tight)));
  const cyPx = 18 + sink * (52 + 46 + 4 - 18);
  return {
    cx: ((gapStart + gapEnd) / 2) * unitsPerPx,
    cy: cyPx * unitsPerPx,
    r: 46 * unitsPerPx,
  };
}

async function renderHeader(layout: HeaderLayout) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const header = document.createElement("div");
  const backdrop = document.createElement("div");
  const packLayer = document.createElement("div");
  packLayer.setAttribute("aria-hidden", "true");
  packLayer.style.pointerEvents = "none";
  packLayer.style.position = "absolute";
  packLayer.style.inset = "0";
  const brand = document.createElement("div");
  brand.textContent = "nexi Work";
  const toggle = document.createElement("div");
  toggle.setAttribute("role", "button");
  for (const child of [backdrop, packLayer, brand, toggle]) header.appendChild(child);
  container.appendChild(header);

  withRect(header, {
    left: 0,
    right: layout.width,
    width: layout.width,
    height: 52,
    top: 0,
    bottom: 52,
  });
  withRect(backdrop, { left: 0, right: layout.width, width: layout.width, height: 80, top: 0, bottom: 80 });
  withRect(packLayer, {
    left: 0,
    right: layout.width,
    width: layout.width,
    height: 52,
    top: 0,
    bottom: 52,
  });
  withRect(brand, {
    left: layout.brand[0],
    right: layout.brand[1],
    width: layout.brand[1] - layout.brand[0],
    height: 28,
    top: 12,
    bottom: 40,
  });
  withRect(toggle, {
    left: layout.toggle[0],
    right: layout.toggle[1],
    width: layout.toggle[1] - layout.toggle[0],
    height: 32,
    top: 10,
    bottom: 42,
  });

  let root: Root | null = null;
  await act(async () => {
    root = createRoot(backdrop);
    root.render(<T3TeamNexploreStripArt />);
  });
  const svg = backdrop.querySelector("svg")!;
  return {
    cleanup: () => {
      act(() => root?.unmount());
      container.remove();
    },
    circle: () => svg.querySelector("circle")!,
    svg,
  };
}

describe("T3TeamNexploreStripArt placement", () => {
  it("sits in the header band behind the widest free run, with the pack layer present", async () => {
    const layout = { width: 420, brand: [18, 120], toggle: [372, 404] } satisfies HeaderLayout;
    const { cleanup, circle } = await renderHeader(layout);
    try {
      const el = circle();
      expect(el).not.toBeNull();
      // The regression read the header as fully occupied: the gap collapsed to zero and the orb
      // centred at x=0. Here it must be centred in the run between brand and toggle.
      expect(Number(el.getAttribute("cx"))).toBeCloseTo(295.2, 3);
      expect(Number(el.getAttribute("cy"))).toBeCloseTo(18 * 1.2, 3);
      expect(Number(el.getAttribute("r"))).toBeCloseTo(46 * 1.2, 3);
    } finally {
      cleanup();
    }
  });

  it("keeps its size and sinks below the band when the free run is narrower than the diameter", async () => {
    const layout = { width: 190, brand: [18, 96], toggle: [152, 184] } satisfies HeaderLayout;
    const { cleanup, circle } = await renderHeader(layout);
    try {
      const orb = expectedOrb(layout);
      const el = circle();
      // Gap is 56px < 92px diameter: fully sunk, radius unchanged.
      expect(Number(el.getAttribute("cy"))).toBeCloseTo(102 * 1.2, 3);
      expect(Number(el.getAttribute("r"))).toBeCloseTo(46 * 1.2, 3);
      expect(Number(el.getAttribute("cx"))).toBeCloseTo(orb.cx, 3);
    } finally {
      cleanup();
    }
  });

  it("centres horizontally when the content tiles the header completely", async () => {
    // A full-width wrapper leaves no free run; the orb must not pin itself to the left edge.
    const layout = { width: 420, brand: [0, 420], toggle: [0, 420] } satisfies HeaderLayout;
    const { cleanup, circle } = await renderHeader(layout);
    try {
      const el = circle();
      expect(Number(el.getAttribute("cx"))).toBeCloseTo(210 * 1.2, 3);
      expect(Number(el.getAttribute("r"))).toBeCloseTo(46 * 1.2, 3);
    } finally {
      cleanup();
    }
  });
});
