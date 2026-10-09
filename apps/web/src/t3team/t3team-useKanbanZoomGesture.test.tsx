// @vitest-environment jsdom
/**
 * Continuous inertial pinch: Ctrl+wheel updates progress live; after idle, velocity-biased
 * soft-snap commits onLevelChange.
 */
import { useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { KANBAN_ZOOM_SNAP_MS, type KanbanZoomLevel } from "~/t3team/t3team-kanbanZoom";
import {
  KANBAN_ZOOM_GESTURE_IDLE_MS,
  KANBAN_ZOOM_WHEEL_SENSITIVITY,
  useKanbanZoomGesture,
} from "~/t3team/t3team-useKanbanZoomGesture";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

async function renderHarness(
  initial: KanbanZoomLevel,
  enabled: boolean,
): Promise<{
  container: HTMLElement;
  node: HTMLDivElement;
  getProgress: () => number;
  getLevel: () => KanbanZoomLevel;
}> {
  let progress = 0;
  let level = initial;
  function Harness() {
    const [snap, setSnap] = useState<KanbanZoomLevel>(initial);
    const gesture = useKanbanZoomGesture({ enabled, level: snap, onLevelChange: setSnap });
    progress = gesture.progress;
    level = snap;
    return (
      <div
        ref={gesture.containerRef}
        data-progress={gesture.progress}
        data-level={snap}
        data-gesturing={gesture.isGesturing ? "1" : "0"}
      />
    );
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(<Harness />);
  });
  const node = container.querySelector<HTMLDivElement>("div")!;
  return {
    container,
    node,
    getProgress: () => progress,
    getLevel: () => level,
  };
}

function dispatchWheel(
  node: HTMLElement,
  { ctrlKey, deltaY }: { ctrlKey: boolean; deltaY: number },
): WheelEvent {
  const event = new WheelEvent("wheel", {
    ctrlKey,
    deltaY,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    node.dispatchEvent(event);
  });
  return event;
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) continue;
    await act(async () => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.innerHTML = "";
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe("useKanbanZoomGesture", () => {
  it("tracks ctrl+wheel continuously and prevents page zoom", async () => {
    const { node, getProgress } = await renderHarness("full", true);
    const event = dispatchWheel(node, { ctrlKey: true, deltaY: 100 });
    expect(event.defaultPrevented).toBe(true);
    expect(getProgress()).toBeCloseTo(100 * KANBAN_ZOOM_WHEEL_SENSITIVITY, 5);
    expect(node.getAttribute("data-gesturing")).toBe("1");
  });

  it("soft-snaps to compact after a mid-range gesture settles", async () => {
    const { node, getLevel, getProgress } = await renderHarness("full", true);
    // Land near 0.7 without a huge velocity spike: several small deltas.
    const step = 0.1 / KANBAN_ZOOM_WHEEL_SENSITIVITY;
    for (let i = 0; i < 7; i += 1) {
      dispatchWheel(node, { ctrlKey: true, deltaY: step });
    }
    expect(getProgress()).toBeGreaterThan(0.55);
    expect(getProgress()).toBeLessThan(0.95);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(KANBAN_ZOOM_GESTURE_IDLE_MS + KANBAN_ZOOM_SNAP_MS + 50);
    });
    expect(getLevel()).toBe("compact");
  });

  it("ignores plain (non-ctrl) wheel events", async () => {
    const { node, getProgress } = await renderHarness("full", true);
    const event = dispatchWheel(node, { ctrlKey: false, deltaY: 200 });
    expect(event.defaultPrevented).toBe(false);
    expect(getProgress()).toBe(0);
  });

  it("registers no listener when disabled", async () => {
    const { node, getProgress } = await renderHarness("full", false);
    const event = dispatchWheel(node, { ctrlKey: true, deltaY: 200 });
    expect(event.defaultPrevented).toBe(false);
    expect(getProgress()).toBe(0);
  });
});
