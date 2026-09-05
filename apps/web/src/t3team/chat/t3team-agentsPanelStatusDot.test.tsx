// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";

import { AgentsPanelStatusDot } from "./t3team-agentsPanelStatusDot";

function agent(overrides: Partial<RuntimeSubagent> = {}): RuntimeSubagent {
  return {
    id: "a-1",
    kind: "subagent",
    title: "Sub A",
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
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as RuntimeSubagent;
}

/**
 * Regression: the Agents-panel sub-run dots reuse the shared GHE #201 state-motion
 * DOM (`.t3team-aci-cell[data-t3team-state]` + `--t3team-aci-i` + `.t3team-aci-dot`)
 * so the same motion/hue/waiting-ring CSS in t3team-index.css textures them as the
 * working row — and they carry no native hover tooltip (87325f564).
 */
describe("AgentsPanelStatusDot", () => {
  it("stamps the shared cell attribute with the agent's dot state", () => {
    expect(
      renderToStaticMarkup(<AgentsPanelStatusDot agent={agent({ status: "running" })} />),
    ).toContain('data-t3team-state="working"');
    expect(
      renderToStaticMarkup(<AgentsPanelStatusDot agent={agent({ status: "waiting" })} />),
    ).toContain('data-t3team-state="waiting"');
    expect(
      renderToStaticMarkup(<AgentsPanelStatusDot agent={agent({ status: "completed" })} />),
    ).toContain('data-t3team-state="done"');
    expect(
      renderToStaticMarkup(<AgentsPanelStatusDot agent={agent({ status: "failed" })} />),
    ).toContain('data-t3team-state="error"');
  });

  it("stamps the per-dot hue index on the cell and renders the dot element", () => {
    const markup = renderToStaticMarkup(<AgentsPanelStatusDot agent={agent()} index={3} />);
    expect(markup).toContain("--t3team-aci-i:3");
    expect(markup).toContain("t3team-aci-cell");
    expect(markup).toContain("t3team-aci-dot");
  });

  it("renders no hover tooltip; is decorative by default, labelled when asked", () => {
    const bare = renderToStaticMarkup(<AgentsPanelStatusDot agent={agent()} />);
    expect(bare).not.toContain('title="');
    expect(bare).toContain('aria-hidden="true"');

    const labelled = renderToStaticMarkup(
      <AgentsPanelStatusDot agent={agent()} ariaLabel="Check API compatibility" />,
    );
    expect(labelled).not.toContain('title="');
    expect(labelled).toContain('aria-label="Check API compatibility"');
    expect(labelled).not.toContain("aria-hidden");
  });
});
