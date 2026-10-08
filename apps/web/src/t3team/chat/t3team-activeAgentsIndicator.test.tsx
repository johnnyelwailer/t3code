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

describe("T3TeamActiveAgentsIndicator", () => {
  it("renders one chip per agent with the status word and an accessible name", () => {
    const markup = renderToStaticMarkup(
      <T3TeamActiveAgentsIndicator entries={ENTRIES} onOpenAgents={() => {}} />,
    );
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="2 active agents"');
    expect(markup).toContain('data-t3team-agent-chip=""');
    expect(markup).toContain("Editing code");
    expect(markup).toContain("Running tests");
    expect(markup).toContain('aria-label="Child A — Editing code"');
    expect(markup).toContain('aria-label="Sub B — Running tests"');
  });

  it("opens the agents panel when a chip is clicked and no per-chip opener is set", () => {
    const onOpenAgents = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(<T3TeamActiveAgentsIndicator entries={ENTRIES} onOpenAgents={onOpenAgents} />);
    });
    const chips = container.querySelectorAll<HTMLElement>("[data-t3team-agent-chip]");
    expect(chips.length).toBe(2);
    act(() => {
      chips[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenAgents).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });

  it("stamps each chip with its entry's dotState", () => {
    const markup = renderToStaticMarkup(
      <T3TeamActiveAgentsIndicator entries={ENTRIES} onOpenAgents={() => {}} />,
    );
    expect(markup).toContain('data-t3team-state="writing"');
    expect(markup).toContain('data-t3team-state="working"');
  });

  it("opens the clicked agent when onOpenAgent is provided", () => {
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
    const chips = container.querySelectorAll<HTMLElement>("[data-t3team-agent-chip]");
    expect(chips.length).toBe(2);
    act(() => {
      chips[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
