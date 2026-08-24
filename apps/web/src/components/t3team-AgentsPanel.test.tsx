// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  emptyAgentPanelModel,
  type AgentPanelModel,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

import { AgentsPanel } from "./AgentsPanel";

function createAgent(overrides: Partial<RuntimeSubagent> = {}): RuntimeSubagent {
  return {
    id: "agent-1",
    kind: "subagent",
    title: "Direct spawn",
    role: null,
    model: null,
    effort: null,
    status: "running",
    activationCount: 1,
    usage: null,
    progress: null,
    lastToolName: null,
    result: null,
    error: null,
    outputFile: null,
    parentAgentId: null,
    agentIndex: null,
    phaseIndex: null,
    phaseTitle: null,
    attempt: null,
    workflowName: null,
    phases: [],
    runHandles: null,
    recentActivity: [],
    firstSeenAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function modelWithAgents(): AgentPanelModel {
  return {
    ...emptyAgentPanelModel(),
    directAgents: [createAgent()],
    runningCount: 1,
    hasAgents: true,
  };
}

const FORK_MARKER = "data-t3team-agents-panel-fork-section";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: Parameters<Root["render"]>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root!.render(element);
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

describe("AgentsPanel", () => {
  it("shows the empty-state hero when there are no agents and no fork section", () => {
    render(<AgentsPanel model={emptyAgentPanelModel()} />);
    expect(container!.textContent).toContain("No agents yet");
    expect(container!.querySelector(`[${FORK_MARKER}]`)).toBeNull();
  });

  it("never shows the empty-state hero alongside fork content", () => {
    render(
      <AgentsPanel
        model={emptyAgentPanelModel()}
        forkSection={
          <div data-t3team-agents-panel-fork-section="true">
            <span>Sub-run thread</span>
          </div>
        }
      />,
    );
    expect(container!.textContent).not.toContain("No agents yet");
    expect(container!.textContent).toContain("Sub-run thread");
  });

  it("renders fork-only content inside the bounded scroll container", () => {
    render(
      <AgentsPanel
        model={emptyAgentPanelModel()}
        forkSection={
          <div data-t3team-agents-panel-fork-section="true">
            <span>Sub-run thread</span>
          </div>
        }
      />,
    );
    const viewport = container!.querySelector("[data-slot='scroll-area-viewport']");
    expect(viewport).toBeTruthy();
    expect(viewport!.querySelector(`[${FORK_MARKER}]`)).toBeTruthy();
    // No roster footer when there are no native agents.
    expect(container!.querySelector("footer")).toBeNull();
  });

  it("renders the roster and fork content in the same scroll container", () => {
    render(
      <AgentsPanel
        model={modelWithAgents()}
        forkSection={
          <div data-t3team-agents-panel-fork-section="true">
            <span>Sub-run thread</span>
          </div>
        }
      />,
    );
    expect(container!.textContent).not.toContain("No agents yet");
    const viewport = container!.querySelector("[data-slot='scroll-area-viewport']");
    expect(viewport).toBeTruthy();
    expect(viewport!.textContent).toContain("Direct spawn");
    expect(viewport!.querySelector(`[${FORK_MARKER}]`)).toBeTruthy();
  });
});
