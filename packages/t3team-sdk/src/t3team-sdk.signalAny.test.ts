/**
 * `waitForAny` through the durable engine (design 42): the change-request babysitter loop from
 * `__fixtures__/t3team-sdk.signalWaitAny.workflow.ts`, driven by a deferring mock broker while the
 * test plays the delivery port (appendResolvedEntry + resumeWorkflow), exactly like production.
 *
 *   1. One `signal.waitAny` handle per iteration, parked on all four branches; a non-first branch
 *      wins, the loop advances its watermark and parks again; a losing branch can no longer be
 *      journaled for the settled wait; replay returns the same winners and re-fires nothing.
 *   2. A live drain (the broker settles a winner during the fire) never suspends.
 *   3. The static audit accepts `waitForAny` imported from "@t3team/sdk", and the per-index
 *      payload narrowing is real: reading a branch-specific field without narrowing is a type
 *      error.
 *   4. Only branches `handle.on` minted in this run are accepted.
 */
import * as NodeFS from "node:fs";

import { anyWinner } from "@runbook/core/handlesAny";
import type { HandleDispatch } from "@runbook/core/handles";
import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type * as SignalWaitAnyWorkflow from "./__fixtures__/t3team-sdk.signalWaitAny.workflow.ts";
import { cleanupRunsRoot, resetCounters, runsRoot } from "./t3team-sdk.engineFixtures.ts";
import {
  appendResolvedEntry,
  createMockBroker,
  defineWorkflow,
  resumeWorkflow,
  ScmChangeRequestChecksConcluded,
  ScmChangeRequestMerged,
  ScmChangeRequestWatch,
  startWorkflow,
  WorkflowError,
  type MessageEnvelope,
  type MockBrokerOutcome,
  type SuspendedResult,
  type WorkflowRunResult,
} from "./t3team-sdk.index.ts";
import { journalFilePath } from "./t3team-sdk.journal.ts";
import { readJournalEntries } from "./t3team-sdk.journalReader.ts";
import { createSignalPrimitives } from "./t3team-sdk.signalPrimitive.ts";
import { auditWorkflowSourceStatic } from "./t3team-sdk.staticAudit.ts";
import { formatFinding } from "./t3team-sdk.staticAuditTypes.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

const workflow = defineWorkflow<typeof SignalWaitAnyWorkflow>(
  "./__fixtures__/t3team-sdk.signalWaitAny.workflow.ts",
);
const args = { key: "42" };
const changeRequest = { provider: "github", number: 42, title: "Fix billing", state: "open" };
const checksPayload = { changeRequest, conclusion: "success" };
const mergedPayload = { changeRequest: { ...changeRequest, state: "merged" }, mergedBy: "theo" };
const closedPayload = { changeRequest: { ...changeRequest, state: "closed" } };

const isSuspended = <O>(r: WorkflowRunResult<O> | SuspendedResult): r is SuspendedResult =>
  "suspended" in r;
const defer = (_envelope: MessageEnvelope): MockBrokerOutcome => ({ kind: "defer" });

describe("waitForAny through the durable engine", () => {
  it("parks one handle on every branch, resumes on a non-first branch, and replays the winners", async () => {
    const broker = createMockBroker(defer);
    const base = { runsRoot, tools: [], broker, launchThreadId: "launch-thread" } as const;

    let result = await startWorkflow(workflow, args, base);
    if (!isSuspended(result)) throw new Error("the first iteration must park");
    const first = result.correlationId;
    const parked = broker.sent.filter((envelope) => envelope.kind === "signal.waitAny");
    expect(parked).toHaveLength(1);
    expect(parked[0]?.correlationId).toBe(first);
    const branches = (parked[0]?.payload as { branches: Array<{ signal: string }> }).branches;
    expect(branches.map((branch) => branch.signal)).toEqual([
      "scm.change-request.merged",
      "scm.change-request.closed",
      "scm.change-request.checks.concluded",
      "scm.change-request.review.activity",
    ]);

    // The checks branch (index 2) lands first.
    const reply = anyWinner(2, checksPayload);
    expect(
      await appendResolvedEntry({ runsRoot, runId: result.runId, correlationId: first, reply }),
    ).toBe(true);
    // A losing branch firing later cannot take the settled wait over.
    const late = anyWinner(1, closedPayload);
    expect(
      await appendResolvedEntry({
        runsRoot,
        runId: result.runId,
        correlationId: first,
        reply: late,
      }),
    ).toBe(false);

    result = await resumeWorkflow(result.runId, workflow, args, base);
    if (!isSuspended(result)) throw new Error("the second iteration must park");
    const second = result.correlationId;
    expect(second).not.toBe(first);

    expect(
      await appendResolvedEntry({
        runsRoot,
        runId: result.runId,
        correlationId: second,
        reply: anyWinner(0, mergedPayload),
      }),
    ).toBe(true);
    const done = await resumeWorkflow(result.runId, workflow, args, base);
    if (isSuspended(done)) throw new Error("a merge ends the run");
    expect(done.result).toEqual({ ended: "scm.change-request.merged", seen: ["checks:success"] });

    const { bySeq, byCorrelation } = readJournalEntries(journalFilePath(runsRoot, done.runId));
    expect(byCorrelation.get(first)?.reply).toEqual(reply);
    const waits = [...bySeq.values()].filter((entry) => entry.kind === "signal.waitAny");
    expect(waits.map((entry) => entry.correlationId)).toEqual([first, second]);

    const sentBefore = broker.sent.length;
    const replayed = await resumeWorkflow(done.runId, workflow, args, base);
    if (isSuspended(replayed)) throw new Error("a completed run must not re-suspend on replay");
    expect(replayed.result).toEqual(done.result);
    expect(broker.sent.length).toBe(sentBefore);
  });

  it("settles a live drain during the fire without suspending", async () => {
    const broker = createMockBroker((envelope) =>
      envelope.kind === "signal.waitAny"
        ? { kind: "resolve", reply: anyWinner(1, closedPayload) }
        : { kind: "defer" },
    );
    const base = { runsRoot, tools: [], broker, launchThreadId: "launch-thread" } as const;
    const result = await startWorkflow(workflow, args, base);
    if (isSuspended(result)) throw new Error("a drained wait must not park");
    expect(result.result).toEqual({ ended: "scm.change-request.closed", seen: [] });
  });
});

// Each audit builds a TypeScript program; that exceeds the 5s default on a loaded CI runner.
describe("waitForAny static audit", { timeout: 60_000 }, () => {
  const audit = (sourceText: string) =>
    auditWorkflowSourceStatic(
      { absolutePath: "/fixtures/wait-any.workflow.ts", sourceText },
      { typecheck: true },
    ).map(formatFinding);
  const fixture = NodeFS.readFileSync(
    new URL("./__fixtures__/t3team-sdk.signalWaitAny.workflow.ts", import.meta.url),
    "utf8",
  );

  it("accepts the imported verb and the narrowed per-branch payloads", () => {
    expect(audit(fixture)).toEqual([]);
  });

  it("rejects a branch-specific field read without narrowing on index", () => {
    const unnarrowed = fixture.replace(
      "const seen = cursor.current()?.seen ?? [];",
      "const seen = [hit.payload.conclusion];",
    );
    expect(unnarrowed).not.toBe(fixture);
    expect(audit(unnarrowed).join("\n")).toContain("conclusion");
  });
});

describe("waitForAny branch gate", () => {
  const prims = () => {
    const sends: string[] = [];
    const dispatch = {
      sendOneWay: () => "run:1",
      send: async (call: { kind: string }) => {
        sends.push(call.kind);
        return "run:2";
      },
      awaitResolution: async () => {
        throw new Error("unused");
      },
    } as unknown as HandleDispatch;
    const primitives = createSignalPrimitives({
      dispatch,
      broker: createMockBroker(defer),
      capabilities: new Set(["source:scm.change-request.watch"]),
    });
    return { primitives, sends };
  };
  const params = { projectId: "p1", repository: "owner/repo", number: 42 };

  it("refuses a branch that handle.on did not mint, before any journal traffic", async () => {
    const { primitives, sends } = prims();
    const handle = await primitives.getSignalSource(ScmChangeRequestWatch, params);
    const forged = { ...handle.on(ScmChangeRequestMerged, { key: "42" }) };
    const error = await primitives.waitForAny([forged]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkflowError);
    expect((error as Error).message).toContain("branch 0 was not created by handle.on");
    expect(sends).toEqual([]);
  });

  it("refuses a signal the source does not emit", async () => {
    const { primitives } = prims();
    const handle = await primitives.getSignalSource(ScmChangeRequestWatch, params);
    const on = handle.on as (signal: unknown, opts: { key: string }) => unknown;
    expect(() => on(ScmChangeRequestChecksConcluded, { key: "42" })).toThrow(/not declared/);
  });

  it("refuses an empty branch list before any journal traffic", async () => {
    const { primitives, sends } = prims();
    const error = await primitives.waitForAny([]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkflowError);
    expect(sends).toEqual([]);
  });
});
