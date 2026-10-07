/**
 * GHE #410: an `agent()` child's title and live status label are often identical (e.g. "Story
 * step"), and the naive `${title} — ${statusLabel}` join rendered "Story step — Story step".
 */
import { describe, expect, it } from "vite-plus/test";

import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";

import {
  EMPTY_ACTIVE_AGENTS,
  formatActiveAgentLabel,
  mergeActiveAgentsAndChildren,
} from "~/t3team/chat/t3team-activeAgentsCore";
import { makeProjectThread } from "~/t3team/hooks/t3team-threadBridge.testSupport";
import type { ProjectThread } from "~/t3team/t3team-types";

describe("formatActiveAgentLabel", () => {
  it("drops the redundant status label when it matches the title exactly", () => {
    expect(formatActiveAgentLabel("Story step", "Story step")).toBe("Story step");
  });

  it("drops the redundant status label when it only differs by case", () => {
    expect(formatActiveAgentLabel("Story step", "story step")).toBe("Story step");
  });

  it("drops the redundant status label when it only differs by surrounding whitespace", () => {
    expect(formatActiveAgentLabel("Story step", "  Story step  ")).toBe("Story step");
  });

  it("joins title and status label with an em dash when they differ", () => {
    expect(formatActiveAgentLabel("Story step", "Running")).toBe("Story step — Running");
  });
});

describe("mergeActiveAgentsAndChildren (GHE #201)", () => {
  const child = (overrides: Partial<ProjectThread>): ProjectThread =>
    makeProjectThread({ title: "Child", status: "running", ...overrides });
  const subagent = (overrides: Partial<RuntimeSubagent>): RuntimeSubagent =>
    ({
      id: "agent-1",
      title: "Review release risks",
      status: "running",
      progress: null,
      lastToolName: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    }) as RuntimeSubagent;

  it("merges only active agents: running child threads + running/waiting subagents", () => {
    const entries = mergeActiveAgentsAndChildren({
      childThreads: [
        child({ id: "c-run", title: "Running child" }),
        child({ id: "c-idle", status: "idle" }),
        child({ id: "c-done", status: "completed" }),
        child({ id: "c-err", status: "error" }),
      ],
      subagents: [
        subagent({ id: "a-run", title: "Running agent" }),
        subagent({ id: "a-wait", status: "waiting" }),
        subagent({ id: "a-ok", status: "completed" }),
        subagent({ id: "a-err", status: "failed" }),
      ],
    });
    expect(entries.map((entry) => entry.id)).toEqual([
      "child:c-run",
      "agent:a-run",
      "agent:a-wait",
    ]);
    expect(entries[0]).toMatchObject({ source: "child", statusLabel: "Running" });
    expect(entries[2]).toMatchObject({ source: "subagent", statusLabel: "Waiting" });
  });

  it("prefers the live subagent label (progress > lastToolName > Working)", () => {
    const entries = mergeActiveAgentsAndChildren({
      childThreads: [],
      subagents: [
        subagent({ id: "a-p", progress: "Extracting the schema" }),
        subagent({ id: "a-t", lastToolName: "bash" }),
        subagent({ id: "a-bare" }),
      ],
    });
    expect(entries.map((entry) => entry.statusLabel)).toEqual([
      "Extracting the schema",
      "bash",
      "Working",
    ]);
  });

  it("includes a child that is waiting on agents, with the Waiting label", () => {
    const entries = mergeActiveAgentsAndChildren({
      childThreads: [
        child({
          id: "c-wait",
          status: "idle",
          title: "Parked parent",
          waitingOnChildren: true,
        }),
      ],
      subagents: [],
    });
    expect(entries.map((entry) => entry.statusLabel)).toEqual(["Waiting"]);
  });

  it("returns the stable empty array when nothing is active", () => {
    const entries = mergeActiveAgentsAndChildren({
      childThreads: [child({ id: "c-idle", status: "idle" })],
      subagents: [subagent({ id: "a-ok", status: "completed" })],
    });
    expect(entries).toBe(EMPTY_ACTIVE_AGENTS);
  });

  it("changes the child activityKey when any live field changes", () => {
    const at = (lastMessageAt: string) =>
      mergeActiveAgentsAndChildren({
        childThreads: [child({ id: "c", lastMessageAt, activityLabel: "Reading" })],
        subagents: [],
      })[0]?.activityKey;
    expect(at("2026-01-01T00:00:05Z")).not.toBe(at("2026-01-01T00:00:00Z"));
  });
});
