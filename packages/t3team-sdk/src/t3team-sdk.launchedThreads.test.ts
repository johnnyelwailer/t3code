import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanupRunsRoot, resetCounters, runsRoot } from "./t3team-sdk.engineFixtures.ts";
import type * as LaunchThreadWorkflow from "./__fixtures__/t3team-sdk.launchThread.workflow.ts";
import type * as NoCapabilityWorkflow from "./__fixtures__/t3team-sdk.launchThreadNoCapability.workflow.ts";
import {
  createMockBroker,
  defineWorkflow,
  type MessageEnvelope,
  type MockBrokerOutcome,
  resumeWorkflow,
  startWorkflow,
} from "./t3team-sdk.index.ts";
import { journalFilePath } from "./t3team-sdk.journal.ts";
import { readJournalEntries } from "./t3team-sdk.journalReader.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

const launchWorkflow = defineWorkflow<typeof LaunchThreadWorkflow>(
  "./__fixtures__/t3team-sdk.launchThread.workflow.ts",
);
const noCapabilityWorkflow = defineWorkflow<typeof NoCapabilityWorkflow>(
  "./__fixtures__/t3team-sdk.launchThreadNoCapability.workflow.ts",
);

/** A host that keeps one thread per key, like the server's derived ids. */
function launchHost() {
  const threads = new Map<string, { watching: boolean }>();
  const broker = createMockBroker((envelope: MessageEnvelope): MockBrokerOutcome => {
    const payload = envelope.payload as Record<string, unknown>;
    if (envelope.kind === "thread.launch") {
      const threadId = `launched:${String(payload.key)}`;
      const created = !threads.has(threadId);
      if (created) threads.set(threadId, { watching: false });
      return { kind: "resolve", reply: { ok: true, value: { threadId, created } } };
    }
    if (envelope.kind === "thread.launched") {
      const thread = threads.get(String(payload.threadId))!;
      if (payload.op === "watch") thread.watching = payload.watching === true;
      if (payload.op === "configure") {
        return { kind: "resolve", reply: { ok: false, error: "above the run's mode" } };
      }
      const value =
        payload.op === "read" ? { pullRequests: [{ watching: thread.watching }] } : undefined;
      return { kind: "resolve", reply: { ok: true, value } };
    }
    if (envelope.kind === "run.facts") return { kind: "resolve", reply: { ok: true } };
    return { kind: "defer" };
  });
  return { broker, threads };
}

const sentKinds = (runId: string) =>
  [...readJournalEntries(journalFilePath(runsRoot, runId)).bySeq.values()]
    .toSorted((a, b) => a.seq - b.seq)
    .map((entry) => `${entry.kind}:${entry.refId}`);

describe("launchThread", () => {
  it("journals every verb, and the same key returns the same thread", async () => {
    const { broker, threads } = launchHost();
    const run = await startWorkflow(launchWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker,
      launchThreadId: "launch-thread",
    });
    if ("suspended" in run) throw new Error("expected a completed run");
    expect(run.result).toEqual({
      id: "launched:pr:github.com/acme/app#7",
      created: true,
      againId: "launched:pr:github.com/acme/app#7",
      againCreated: false,
      watching: true,
      refused: "above the run's mode",
    });
    expect(threads.size).toBe(1);
    expect(sentKinds(run.runId)).toEqual([
      "thread.launch:pr:github.com/acme/app#7",
      "thread.launched:watch",
      "thread.launched:send",
      "thread.launch:pr:github.com/acme/app#7",
      "thread.launched:read",
      "thread.launched:facts",
      "run.facts:run.facts",
      "thread.launched:configure",
    ]);
  });

  it("REPLAY: a resume reads every answer from the journal and asks the host nothing", async () => {
    const first = launchHost();
    const run = await startWorkflow(launchWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker: first.broker,
      launchThreadId: "launch-thread",
    });
    const second = launchHost();
    const resumed = await resumeWorkflow(run.runId, launchWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker: second.broker,
      launchThreadId: "launch-thread",
    });
    if ("suspended" in resumed || "suspended" in run) throw new Error("expected completed runs");
    // Same thread, same answers — including the refusal — and no second launch.
    expect(resumed.result).toEqual(run.result);
    expect(second.broker.sent).toHaveLength(0);
    expect(second.threads.size).toBe(0);
  });

  it("RECOVERY: a launch recorded as sent but never answered is sent again on resume", async () => {
    // The first host dies mid-request: it never settles `thread.launch`, so the run parks.
    const dying = createMockBroker((envelope: MessageEnvelope): MockBrokerOutcome =>
      envelope.kind === "thread.launch" ? { kind: "defer" } : { kind: "defer" },
    );
    const run = await startWorkflow(launchWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker: dying,
      launchThreadId: "launch-thread",
    });
    expect("suspended" in run).toBe(true);
    const recovered = launchHost();
    const resumed = await resumeWorkflow(run.runId, launchWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker: recovered.broker,
      launchThreadId: "launch-thread",
    });
    if ("suspended" in resumed) throw new Error("expected the resume to complete");
    expect(resumed.result.id).toBe("launched:pr:github.com/acme/app#7");
    expect(recovered.broker.sent[0]?.kind).toBe("thread.launch");
    expect(recovered.broker.sent[0]?.redelivery).toBe(true);
  });

  it("is refused without the launch capability", async () => {
    const { broker } = launchHost();
    await expect(
      startWorkflow(noCapabilityWorkflow, undefined, {
        runsRoot,
        tools: [],
        broker,
        launchThreadId: "launch-thread",
      }),
    ).rejects.toThrow("'launchThread' requires the 'launch' capability");
    expect(broker.sent).toHaveLength(0);
  });
});
