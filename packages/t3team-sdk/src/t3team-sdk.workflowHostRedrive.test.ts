/**
 * `WorkflowRunHost.redrive`: a reply-less replay through the same guard and failure funnel as
 * `resume`. Plain, it re-drives from the journal; with `refire`, it re-sends the one recorded,
 * unanswered ask a host saw fail out of band — same correlationId, same payload.
 */

import { afterAll, describe, expect, it, vi } from "vite-plus/test";

import {
  appendResolvedEntry,
  createWorkflowHostRegistry,
  createWorkflowRunHost,
  type WorkflowHostLifecycle,
} from "./t3team-sdk.index.ts";
import { askResponseWorkflow, cleanupRunsRoot, runsRoot } from "./t3team-sdk.engineFixtures.ts";
import { createMockBroker } from "./t3team-sdk.broker.ts";

const lifecycle = (overrides: Partial<WorkflowHostLifecycle> = {}): WorkflowHostLifecycle => ({
  recordRunning: async () => {},
  recordActive: async () => true,
  releaseActive: () => {},
  recordCompleted: async () => {},
  recordFailed: async () => {},
  orphanIfSleeping: async () => {},
  ...overrides,
});

/** A parked ask host whose broker defers until `answer` is set, then answers re-fires. */
function parkedAskHost(
  runId: string,
  overrides: Partial<WorkflowHostLifecycle> = {},
  staticRefire?: string,
) {
  const decision = { answer: undefined as string | undefined };
  const broker = createMockBroker(() =>
    decision.answer === undefined ? { kind: "defer" } : { kind: "resolve", reply: decision.answer },
  );
  const onCompleted = vi.fn(async () => {});
  const onFailed = vi.fn(
    async (_detail: { readonly phase: string; readonly error: unknown }) => {},
  );
  const registry = createWorkflowHostRegistry();
  const host = createWorkflowRunHost({
    ref: askResponseWorkflow,
    args: { question: "ship it?" },
    runId,
    runOptions: {
      runsRoot,
      tools: [],
      broker,
      launchThreadId: "launch-thread",
      ...(staticRefire === undefined ? {} : { refire: staticRefire }),
    },
    registry,
    lifecycle: lifecycle(overrides),
    sinks: { onCompleted, onFailed },
  });
  return { host, broker, decision, onCompleted, onFailed, registry };
}

describe("durable workflow engine — host redrive", () => {
  afterAll(cleanupRunsRoot);

  it("redrive({ refire }) re-sends the parked ask unchanged and settles its reply", async () => {
    const run = parkedAskHost("host-refire");
    expect(await run.host.start()).toBe("suspended");

    run.decision.answer = "yes";
    await run.host.redrive({ refire: "host-refire:1" });

    expect(run.broker.sent).toHaveLength(2);
    const [first, again] = run.broker.sent;
    expect(again?.correlationId).toBe("host-refire:1");
    expect(JSON.stringify(again?.payload)).toBe(JSON.stringify(first?.payload));
    expect(first?.redelivery).toBeUndefined();
    expect(again?.redelivery).toBe(true);
    expect(run.onCompleted).toHaveBeenCalledOnce();
    expect(run.onFailed).not.toHaveBeenCalled();
  });

  it("plain redrive() replays without re-sending: parked stays parked, a journaled reply completes", async () => {
    const run = parkedAskHost("host-plain-redrive");
    expect(await run.host.start()).toBe("suspended");

    await run.host.redrive();
    expect(run.broker.sent).toHaveLength(1);
    expect(run.onCompleted).not.toHaveBeenCalled();
    expect(run.onFailed).not.toHaveBeenCalled();

    await appendResolvedEntry({
      runsRoot,
      runId: "host-plain-redrive",
      correlationId: "host-plain-redrive:1",
      reply: "yes",
    });
    await run.host.redrive();
    expect(run.broker.sent).toHaveLength(1);
    expect(run.onCompleted).toHaveBeenCalledOnce();
  });

  it("a redrive issued while a drive is in flight is dropped (a host retry), and a lost admission drives nothing", async () => {
    const recordActive = vi.fn(async () => false);
    const run = parkedAskHost("host-redrive-admission", { recordActive });
    await Promise.all([
      run.host.redrive({ refire: "host-redrive-admission:1" }),
      run.host.redrive({ refire: "host-redrive-admission:1" }),
    ]);
    expect(recordActive).toHaveBeenCalledOnce();
    expect(run.broker.sent).toHaveLength(0);
    // The registry hands the same entry point to a host that only holds the run id.
    expect(run.registry.getRun("host-redrive-admission")?.redrive).toBe(run.host.redrive);
  });

  it("a refire left on the static runOptions applies to no drive: start, plain redrive and resume ignore it", async () => {
    // Pointed at the run's real ask, so a leaked `refire` would visibly misfire: start would be
    // refused, a plain redrive would re-send, and resume would fail on the journaled reply.
    const run = parkedAskHost("host-static-refire", {}, "host-static-refire:1");
    expect(await run.host.start()).toBe("suspended");

    await run.host.redrive();
    expect(run.broker.sent).toHaveLength(1);
    expect(run.broker.sent[0]?.redelivery).toBeUndefined();
    expect(run.onFailed).not.toHaveBeenCalled();

    await run.host.resume("host-static-refire:1", "yes");
    expect(run.broker.sent).toHaveLength(1);
    expect(run.onFailed).not.toHaveBeenCalled();
    expect(run.onCompleted).toHaveBeenCalledOnce();
  });

  it("a refire the journal cannot honour reaches the failure sink, not a silent park", async () => {
    const run = parkedAskHost("host-bad-refire");
    expect(await run.host.start()).toBe("suspended");

    await run.host.redrive({ refire: "host-bad-refire:99" });
    expect(run.onFailed).toHaveBeenCalledOnce();
    const failure = run.onFailed.mock.calls[0]?.[0];
    expect(failure?.phase).toBe("resume");
    expect(String(failure?.error)).toContain("no recorded ask");
    expect(run.broker.sent).toHaveLength(1);
  });
});
