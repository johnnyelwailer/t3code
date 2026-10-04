// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import { deriveDotState, type ActiveAgentEntry } from "./t3team-activeAgentsCore";
import { T3TeamActiveAgentsIndicator } from "./t3team-activeAgentsIndicator";

const ENTRIES: readonly ActiveAgentEntry[] = [
  {
    id: "child:thread-1",
    source: "child",
    title: "Child A",
    statusLabel: "Editing code",
    activityKey: "k1",
    dotState: "writing",
  },
  {
    id: "agent:sub-1",
    source: "subagent",
    title: "Sub B",
    statusLabel: "Running tests",
    activityKey: "k2",
    dotState: "working",
  },
];

/**
 * Regression: the dots of the working-row active-agents indicator must NOT
 * carry a native hover tooltip. The working row already renders the status
 * word + live step label right next to the dots, and hovering a dot flips
 * that label to the agent's live status — a second tooltip was redundant.
 * The accessible name (aria-label) and the click-to-open-agents-panel
 * behavior are kept.
 */
describe("T3TeamActiveAgentsIndicator", () => {
  it("renders no hover tooltip (no title attribute) on the dot group", () => {
    const markup = renderToStaticMarkup(
      <T3TeamActiveAgentsIndicator entries={ENTRIES} onOpenAgents={() => {}} />,
    );
    expect(markup).not.toContain('title="');
    // The accessible name still carries the same info for screen readers.
    expect(markup).toContain('aria-label="2 active agents — open agents"');
    // One dot per entry, each with its own accessible name.
    expect(markup).toContain('aria-label="Child A — Editing code"');
    expect(markup).toContain('aria-label="Sub B — Running tests"');
  });

  it("still opens the agents panel on click of the dot group", () => {
    const onOpenAgents = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(<T3TeamActiveAgentsIndicator entries={ENTRIES} onOpenAgents={onOpenAgents} />);
    });
    const group = container.querySelector<HTMLElement>('[role="button"]');
    expect(group).not.toBeNull();
    expect(group!.getAttribute("title")).toBeNull();
    act(() => {
      group!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenAgents).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });

  it("stamps each dot with its entry's dotState (state-texture hook)", () => {
    const markup = renderToStaticMarkup(
      <T3TeamActiveAgentsIndicator entries={ENTRIES} onOpenAgents={() => {}} />,
    );
    expect(markup).toContain('data-t3team-state="writing"');
    expect(markup).toContain('data-t3team-state="working"');
  });

  it("opens the clicked agent when onOpenAgent is provided (per-dot open)", () => {
    const onOpenAgents = vi.fn();
    const onOpenAgent = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(
        <T3TeamActiveAgentsIndicator
          entries={ENTRIES}
          onOpenAgents={onOpenAgents}
          onOpenAgent={onOpenAgent}
        />,
      );
    });
    const dots = container.querySelectorAll<HTMLElement>(".t3team-aci-cell");
    expect(dots.length).toBe(2);
    act(() => {
      dots[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenAgent).toHaveBeenCalledTimes(1);
    expect(onOpenAgent).toHaveBeenCalledWith(ENTRIES[1]);
    expect(onOpenAgents).toHaveBeenCalledTimes(0);
    act(() => root.unmount());
    container.remove();
  });
});

describe("deriveDotState", () => {
  it("classifies read-ish labels as thinking, write-ish as writing, rest as working", () => {
    expect(deriveDotState({ label: "Reading contracts" })).toBe("thinking");
    expect(deriveDotState({ label: "Searching the repo" })).toBe("thinking");
    expect(deriveDotState({ label: "Editing code" })).toBe("writing");
    expect(deriveDotState({ label: "Drafting notes" })).toBe("writing");
    expect(deriveDotState({ label: "Running tests" })).toBe("working");
    expect(deriveDotState({ label: null })).toBe("working");
    expect(deriveDotState({ label: "anything", status: "waiting" })).toBe("waiting");
  });
});
