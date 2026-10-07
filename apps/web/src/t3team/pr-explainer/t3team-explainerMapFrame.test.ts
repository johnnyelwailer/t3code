import { describe, expect, it } from "vite-plus/test";

import type { T3TeamExplainer, T3TeamExplainerMapBlock } from "./model/t3team-explainer";
import { backendExplainer } from "./stories/t3team-explainerBackend.fixtures";
import { deriveExplainerMapView } from "./t3team-explainerMapFrame";

function mapBlock(explainer: T3TeamExplainer, step: number) {
  const block = explainer.steps[step]?.blocks.find((candidate) => candidate.type === "map");
  return (block ?? null) as T3TeamExplainerMapBlock | null;
}

function phases(step: number, explainer = backendExplainer, streaming = false) {
  const view = deriveExplainerMapView(explainer, step, mapBlock(explainer, step), { streaming })!;
  return {
    node: Object.fromEntries(view.nodes.map((entry) => [entry.node.id, entry])),
    edge: Object.fromEntries(view.edges.map((entry) => [entry.edge.id, entry])),
  };
}

describe("deriveExplainerMapView", () => {
  it("hides parts before the step that introduces them, and enters them on it", () => {
    expect(phases(0).node.cache?.phase).toBe("hidden");
    expect(phases(1).node.cache?.phase).toBe("entering");
    expect(phases(2).node.cache?.phase).toBe("present");
  });

  it("crosses a removed edge out on its step and keeps it faint after", () => {
    expect(phases(1).edge["loader-github"]?.phase).toBe("present");
    expect(phases(2).edge["loader-github"]?.phase).toBe("removing");
    expect(phases(3).edge["loader-github"]?.phase).toBe("gone");
  });

  it("derives an edge's phase from its nodes: it enters and leaves with them", () => {
    // `cache-github` names no step of its own; it arrives with the cache node.
    expect(phases(0).edge["cache-github"]?.phase).toBe("hidden");
    expect(phases(1).edge["cache-github"]?.phase).toBe("entering");
    const removed = {
      ...backendExplainer,
      map: {
        ...backendExplainer.map!,
        nodes: backendExplainer.map!.nodes.map((node) =>
          node.id === "github" ? { ...node, removedAt: "s4" } : node,
        ),
      },
    };
    expect(phases(3, removed).edge["cache-github"]?.phase).toBe("removing");
    expect(phases(4, removed).edge["cache-github"]?.phase).toBe("gone");
  });

  it("marks the step's flow, focus and warning from its map block", () => {
    expect(phases(4).node.cache).toMatchObject({ warn: true, focus: true });
    expect(phases(2).edge["loader-cache"]?.flow).toBe(true);
    expect(phases(2).edge["ui-loader"]?.focus).toBe(false);
  });

  it("waits for a step that has not streamed in yet", () => {
    const partial = { ...backendExplainer, steps: backendExplainer.steps.slice(0, 2) };
    expect(phases(1, partial, true).node.tests?.phase).toBe("hidden");
  });

  it("ignores a step reference that will never resolve once the explainer is complete", () => {
    const typo = {
      ...backendExplainer,
      map: {
        ...backendExplainer.map!,
        nodes: backendExplainer.map!.nodes.map((node) =>
          node.id === "tests" ? { ...node, since: "s-typo" } : node,
        ),
      },
    };
    expect(phases(0, typo).node.tests?.phase).toBe("present");
  });
});
