/**
 * `WorkflowRunHost.offer` — the queued wake an event delivery uses when several sources feed one
 * parked run. `resume` drops a call that arrives while another drive is settling; `offer` waits
 * that drive out and only then decides which parked correlation (if any) the reply answers.
 *
 * Driven on the any-wait babysitter loop (`__fixtures__/t3team-sdk.signalWaitAny.workflow.ts`),
 * with a lifecycle gate holding one drive in flight — no sleeps: the gate is a plain deferred.
 */
import { anyWinner } from "@runbook/core/handlesAny";
import { afterAll, describe, expect, it, vi } from "vite-plus/test";

import type * as SignalWaitAnyWorkflow from "./__fixtures__/t3team-sdk.signalWaitAny.workflow.ts";
import { cleanupRunsRoot, runsRoot } from "./t3team-sdk.engineFixtures.ts";
import {
  createMockBroker,
  createWorkflowHostRegistry,
  createWorkflowRunHost,
  defineWorkflow,
  type WorkflowHostLifecycle,
} from "./t3team-sdk.index.ts";
import { journalFilePath } from "./t3team-sdk.journal.ts";
import { readJournalEntries } from "./t3team-sdk.journalReader.ts";

afterAll(cleanupRunsRoot);

const workflow = defineWorkflow<typeof SignalWaitAnyWorkflow>(
  "./__fixtures__/t3team-sdk.signalWaitAny.workflow.ts",
);
const changeRequest = { provider: "github", number: 42, title: "Fix billing", state: "open" };
const checks = anyWinner(2, { changeRequest, conclusion: "success" });
const merged = anyWinner(0, { changeRequest: { ...changeRequest, state: "merged" } });

/** A host whose FIRST gated lifecycle call waits for `release()` — one drive held in flight. */
function makeHost(runId: string, gated: "recordRunning" | "recordActive") {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let held = false;
  const hold = async () => {
    if (held) return;
    held = true;
    await gate;
  };
  const broker = createMockBroker(() => ({ kind: "defer" }));
  const lifecycle: WorkflowHostLifecycle = {
    recordRunning: async () => (gated === "recordRunning" ? hold() : undefined),
    recordActive: async () => {
      if (gated === "recordActive") await hold();
      return true;
    },
    releaseActive: () => {},
    recordCompleted: async () => {},
    recordFailed: async () => {},
    orphanIfSleeping: async () => {},
  };
  const registry = createWorkflowHostRegistry();
  const onCompleted = vi.fn(async (_result: unknown) => {});
  const onFailed = vi.fn(async () => {});
  const host = createWorkflowRunHost({
    ref: workflow,
    args: { key: "42" },
    runId,
    runOptions: { runsRoot, tools: [], broker },
    registry,
    lifecycle,
    sinks: { onCompleted, onFailed },
  });
  /** The any-wait the run is parked on right now: the newest one the broker saw fire. */
  const parkedOn = () =>
    broker.sent.filter((e) => e.kind === "signal.waitAny").at(-1)?.correlationId;
  return { host, registry, release, parkedOn, onCompleted, onFailed };
}

describe("workflow host offer", () => {
  it("waits out an in-flight resume and answers the wait that drive parked on", async () => {
    const run = makeHost("offer-queued", "recordActive");
    expect(await run.host.start()).toBe("suspended");
    const first = run.parkedOn()!;

    const resumed = run.host.resume(first, checks); // held at recordActive: a drive in flight
    const decided: Array<string | undefined> = [];
    const offered = run.host.offer(async () => {
      decided.push(run.parkedOn());
      return { correlationId: run.parkedOn()!, reply: merged };
    });
    run.release();
    await resumed;

    expect(await offered).toBe(true);
    expect(decided).toHaveLength(1);
    expect(decided[0]).not.toBe(first); // decided against the SECOND iteration's park
    expect(run.onCompleted).toHaveBeenCalledOnce();
    expect(run.onCompleted.mock.calls[0]?.[0]).toMatchObject({
      result: { ended: "scm.change-request.merged", seen: ["checks:success"] },
    });
    expect(run.onFailed).not.toHaveBeenCalled();
  });

  it("lets two offers woken by the same drive claim the slot one after the other", async () => {
    const run = makeHost("offer-two", "recordActive");
    expect(await run.host.start()).toBe("suspended");
    const resumed = run.host.resume(run.parkedOn()!, checks);
    const decided: string[] = [];
    const answer = (reply: unknown) => async () => {
      decided.push(run.parkedOn()!);
      return { correlationId: run.parkedOn()!, reply };
    };
    const offers = [run.host.offer(answer(checks)), run.host.offer(answer(merged))];
    run.release();
    await resumed;

    expect(await Promise.all(offers)).toEqual([true, true]);
    expect(new Set(decided).size).toBe(2); // each decided against its own, later park
    expect(run.onCompleted.mock.calls[0]?.[0]).toMatchObject({
      result: { ended: "scm.change-request.merged", seen: ["checks:success", "checks:success"] },
    });
  });

  it("waits out the launch drive before deciding", async () => {
    const run = makeHost("offer-after-start", "recordRunning");
    const started = run.host.start(); // held at recordRunning: nothing journaled yet
    const offered = run.host.offer(async () => ({ correlationId: run.parkedOn()!, reply: merged }));
    run.release();
    expect(await started).toBe("suspended");
    expect(await offered).toBe(true);
    expect(run.onCompleted).toHaveBeenCalledOnce();
    expect(run.onFailed).not.toHaveBeenCalled();
  });

  it("declines without journaling, leaving the run parked and the reply with the caller", async () => {
    const run = makeHost("offer-declined", "recordActive");
    run.release();
    expect(await run.host.start()).toBe("suspended");
    const parked = run.parkedOn()!;
    expect(await run.host.offer(async () => undefined)).toBe(false);
    const { byCorrelation } = readJournalEntries(journalFilePath(runsRoot, "offer-declined"));
    expect(byCorrelation.has(parked)).toBe(false);
    expect(run.registry.getRun("offer-declined")).toBeDefined();
    // A wait that is already settled is not answered twice either.
    await run.host.resume(parked, checks);
    expect(await run.host.offer(async () => ({ correlationId: parked, reply: merged }))).toBe(
      false,
    );
  });

  it("does not decide at all once the in-flight drive finished the run", async () => {
    const run = makeHost("offer-after-finish", "recordActive");
    expect(await run.host.start()).toBe("suspended");
    const resumed = run.host.resume(run.parkedOn()!, merged);
    const decide = vi.fn(async () => undefined);
    const offered = run.host.offer(decide);
    run.release();
    await resumed;
    expect(await offered).toBe(false);
    expect(decide).not.toHaveBeenCalled();
    expect(run.registry.getRun("offer-after-finish")).toBeUndefined();
  });
});
