// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ActiveAgentEntry } from "./t3team-activeAgentsCore";
import { T3TeamActiveAgentsIndicator } from "./t3team-activeAgentsIndicator";

const ENTRIES: readonly ActiveAgentEntry[] = [
  {
    id: "child:thread-1",
    source: "child",
    title: "Child A",
    statusLabel: "Editing code",
    activityKey: "k1",
  },
  {
    id: "agent:sub-1",
    source: "subagent",
    title: "Sub B",
    statusLabel: "Running tests",
    activityKey: "k2",
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
});
