// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useDigestViewTransition } from "~/t3team/t3team-useDigestViewTransition";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const transitions = vi.hoisted((): { commits: Array<() => void> } => ({ commits: [] }));

vi.mock("~/t3team/t3team-digestViewTransition", () => ({
  runDigestViewTransition: (update: () => void) => {
    transitions.commits.push(update);
  },
}));

function Probe({ value, structureKey }: { value: string; structureKey: string }) {
  return <p>{useDigestViewTransition(value, structureKey)}</p>;
}

describe("useDigestViewTransition", () => {
  let container: HTMLDivElement;
  let root: Root;
  const show = (value: string, structureKey: string) =>
    act(() => {
      root.render(<Probe value={value} structureKey={structureKey} />);
    });
  const shown = () => container.textContent;
  const commitPendingTransition = () =>
    act(() => {
      transitions.commits.shift()?.();
    });

  beforeEach(() => {
    transitions.commits.length = 0;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("paints the first value without animating it", () => {
    show("first", "layout-1");

    expect(shown()).toBe("first");
    expect(transitions.commits).toHaveLength(0);
  });

  it("shows a change that leaves the layout alone at once, with no transition", () => {
    show("first", "layout-1");
    show("retitled", "layout-1");

    expect(shown()).toBe("retitled");
    expect(transitions.commits).toHaveLength(0);
  });

  it("keeps the old layout on screen until the transition commits the new one", () => {
    show("first", "layout-1");
    show("moved", "layout-2");

    expect(shown()).toBe("first");
    expect(transitions.commits).toHaveLength(1);

    commitPendingTransition();

    expect(shown()).toBe("moved");
  });

  it("lands the newest value when more arrives before the transition commits", () => {
    show("first", "layout-1");
    show("moved", "layout-2");
    show("moved, retitled", "layout-2");

    expect(shown()).toBe("first");
    expect(transitions.commits).toHaveLength(1);

    commitPendingTransition();

    expect(shown()).toBe("moved, retitled");
  });

  it("starts another transition for a second layout change", () => {
    show("first", "layout-1");
    show("moved", "layout-2");
    commitPendingTransition();
    show("moved again", "layout-3");

    expect(shown()).toBe("moved");
    expect(transitions.commits).toHaveLength(1);

    commitPendingTransition();

    expect(shown()).toBe("moved again");
  });
});
