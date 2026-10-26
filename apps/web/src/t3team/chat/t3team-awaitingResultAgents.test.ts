/**
 * A thread whose agent ended its turn on "the child will wake me" must not read as finished.
 * Live report (cloud session, 2026-10-26): the triage child finished a moment after the parent
 * ended its turn, and for about a minute the thread showed only "Worked for 6m 28s" before the
 * completion wake resumed the agent. The delegated task's undelivered completion is the signal.
 */
import {
  NodeId,
  type OrchestrationV2Subagent,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import type { ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsCore";
import {
  awaitingAgentsLead,
  deriveAwaitingResultEntries,
} from "~/t3team/chat/t3team-awaitingResultAgents";

const at = DateTime.makeUnsafe("2026-10-26T14:20:00.000Z");

function task(
  id: string,
  overrides: Partial<OrchestrationV2Subagent> = {},
): OrchestrationV2Subagent {
  return {
    id: NodeId.make(id),
    threadId: ThreadId.make("parent"),
    runId: RunId.make("parent-run"),
    parentNodeId: NodeId.make("parent-root"),
    origin: "app_owned",
    createdBy: "agent",
    driver: ProviderDriverKind.make("pi"),
    providerInstanceId: ProviderInstanceId.make("nexplore"),
    providerThreadId: null,
    childThreadId: ThreadId.make(`${id}-thread`),
    nativeTaskRef: null,
    prompt: "Triage open issues",
    title: "Triage open issues",
    model: null,
    completionWake: "always",
    completionDelivery: { state: "pending", observedByRunId: null },
    status: "completed",
    result: "done",
    startedAt: at,
    completedAt: at,
    updatedAt: at,
    ...overrides,
  };
}

describe("deriveAwaitingResultEntries", () => {
  it("lists a finished delegated task whose result has not reached the agent yet", () => {
    const entries = deriveAwaitingResultEntries([task("triage")]);
    expect(entries).toEqual([
      expect.objectContaining({
        id: "agent:triage",
        title: "Triage open issues",
        dotState: "settled",
        statusLabel: "Finished · resuming the agent",
      }),
    ]);
  });

  it("keeps a task whose wake is queued (claimed) until that wake has run", () => {
    const entries = deriveAwaitingResultEntries([
      task("triage", { completionDelivery: { state: "claimed", observedByRunId: null } }),
    ]);
    expect(entries).toHaveLength(1);
  });

  it("says a failed task resumes the agent too", () => {
    const [entry] = deriveAwaitingResultEntries([task("triage", { status: "failed" })]);
    expect(entry?.statusLabel).toBe("Failed · resuming the agent");
  });

  it("drops results the agent already has, and tasks still running (they are live agents)", () => {
    expect(
      deriveAwaitingResultEntries([
        task("delivered", { completionDelivery: { state: "delivered", observedByRunId: null } }),
        task("read", {
          completionDelivery: { state: "acknowledged", observedByRunId: RunId.make("parent-run") },
        }),
        task("stopped", { completionDelivery: { state: "disposed", observedByRunId: null } }),
        task("running", { status: "running", completedAt: null }),
        task("legacy", { completionDelivery: undefined }),
        task("native", { origin: "provider_native" }),
      ]),
    ).toEqual([]);
  });

  it("falls back to a neutral title for an untitled task", () => {
    const [entry] = deriveAwaitingResultEntries([task("untitled", { title: null })]);
    expect(entry?.title).toBe("Delegated task");
  });
});

const entry = (title: string, dotState: ActiveAgentEntry["dotState"]): ActiveAgentEntry => ({
  id: `agent:${title}`,
  source: "subagent",
  title,
  statusLabel: title,
  activityKey: title,
  dotState,
});

describe("awaitingAgentsLead", () => {
  it("names the one agent the thread waits for", () => {
    expect(awaitingAgentsLead([entry("Triage open issues", "working")])).toBe(
      "Waiting for Triage open issues",
    );
  });

  it("counts several live agents", () => {
    expect(awaitingAgentsLead([entry("A", "working"), entry("B", "waiting")])).toBe(
      "Waiting for 2 agents",
    );
  });

  it("says the agent resumes once every awaited task has finished", () => {
    expect(awaitingAgentsLead([entry("Triage open issues", "settled")])).toBe(
      "Triage open issues finished · resuming",
    );
    expect(awaitingAgentsLead([entry("A", "settled"), entry("B", "settled")])).toBe(
      "2 tasks finished · resuming",
    );
  });

  it("keeps waiting while any agent is still live", () => {
    expect(awaitingAgentsLead([entry("A", "settled"), entry("B", "working")])).toBe(
      "Waiting for B",
    );
  });

  it("has nothing to say without agents", () => {
    expect(awaitingAgentsLead([])).toBeNull();
  });
});
