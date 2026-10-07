import { describe, expect, it } from "vite-plus/test";

import { backendExplainer } from "~/t3team/stories/t3team-prExplainerBackend.fixtures";

import { derivePrExplainerMapFrame } from "./t3team-prExplainerMapFrame";

function phases(step: number) {
  const frame = derivePrExplainerMapFrame(backendExplainer, step)!;
  return {
    node: Object.fromEntries(frame.nodes.map((entry) => [entry.node.id, entry])),
    edge: Object.fromEntries(frame.edges.map((entry) => [entry.edge.id, entry])),
  };
}

describe("derivePrExplainerMapFrame", () => {
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

  it("marks the step's flow, focus and warning", () => {
    const check = phases(4);
    expect(check.node.cache).toMatchObject({ warn: true, focus: true });
    const change = phases(2);
    expect(change.edge["loader-cache"]?.flow).toBe(true);
    expect(change.edge["ui-loader"]?.focus).toBe(false);
  });

  it("hides an edge whose node is not on the map yet", () => {
    const explainer = {
      ...backendExplainer,
      map: {
        nodes: backendExplainer.map!.nodes,
        edges: [{ id: "early", from: "ui", to: "tests" }],
      },
    };
    expect(derivePrExplainerMapFrame(explainer, 0)?.edges[0]?.phase).toBe("hidden");
    expect(derivePrExplainerMapFrame(explainer, 5)?.edges[0]?.phase).toBe("present");
  });

  it("treats a step that has not streamed in yet as the future", () => {
    const partial = { ...backendExplainer, steps: backendExplainer.steps.slice(0, 2) };
    const frame = derivePrExplainerMapFrame(partial, 1)!;
    expect(frame.nodes.find((entry) => entry.node.id === "tests")?.phase).toBe("hidden");
  });
});
