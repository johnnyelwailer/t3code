/**
 * Signal-source engine test (design 42): the `getSignalSource` / `waitFor` pipeline through the
 * durable engine.
 *
 * Three paths, one mock broker each:
 *   1. SUSPEND → RESUME: two `waitFor`s on different signals; the broker defers, the test plays
 *      the delivery role (appendResolvedEntry + resumeWorkflow) — the same journaled path the
 *      production delivery port drives.
 *   2. LIVE DRAIN + KEY DEDUP: the broker answers every `signal.wait` synchronously; two
 *      awaits of the same `(signal, key)` journal ONE handle.
 *   3. CAPABILITY GATE: binding a source without its `source:<name>` capability rejects with
 *      PermissionDeniedError before the broker is touched.
 *
 * Replay guarantee asserted in (1): a completed run re-runs with zero re-fired envelopes.
 */

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  cleanupRunsRoot,
  resetCounters,
  runsRoot,
  signalKeyDedupeWorkflow,
  signalNoCapabilityWorkflow,
  signalTwoWaitsWorkflow,
} from "./t3team-sdk.engineFixtures.ts";
import {
  appendResolvedEntry,
  createMockBroker,
  resumeWorkflow,
  startWorkflow,
  type MessageEnvelope,
  type MockBrokerOutcome,
  PermissionDeniedError,
  type SuspendedResult,
  type WorkflowRunResult,
} from "./t3team-sdk.index.ts";
import { journalFilePath } from "./t3team-sdk.journal.ts";
import { readJournalEntries } from "./t3team-sdk.journalReader.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

const isSuspended = <O>(r: WorkflowRunResult<O> | SuspendedResult): r is SuspendedResult =>
  "suspended" in r;

const mergedPayload = {
  changeRequest: {
    provider: "github",
    number: 42,
    title: "Fix the billing path",
    url: "https://github.com/owner/repo/pull/42",
    state: "merged",
    isDraft: false,
    mergedAt: "2026-09-14T10:00:00Z",
  },
  mergedBy: "theo",
};

const closedPayload = {
  changeRequest: {
    provider: "github",
    number: 42,
    title: "Fix the billing path",
    state: "closed",
  },
};

/** Defers every `signal.wait` (and the one-way register): the run parks on each wait. */
const deferEverything = (_envelope: MessageEnvelope): MockBrokerOutcome => ({ kind: "defer" });

/** Answers every `signal.wait` synchronously with the merged payload: the live-drain path. */
const resolveEveryWait = (envelope: MessageEnvelope): MockBrokerOutcome =>
  envelope.kind === "signal.wait" ? { kind: "resolve", reply: mergedPayload } : { kind: "defer" };

describe("durable workflow engine — signal sources (design 42)", () => {
  it("parks on each waitFor and resumes through the journaled delivery path", async () => {
    const broker = createMockBroker(deferEverything);
    const base = { runsRoot, tools: [], broker, launchThreadId: "launch-thread" } as const;
    const args = { key: "42" };

    let result: WorkflowRunResult<unknown> | SuspendedResult = await startWorkflow(
      signalTwoWaitsWorkflow,
      args,
      base,
    );
    expect(isSuspended(result)).toBe(true);
    const firstCorrelation = result.correlationId;

    // Play the delivery role: journal the merged signal's payload, then resume.
    const wrote = await appendResolvedEntry({
      runsRoot,
      runId: result.runId,
      correlationId: firstCorrelation,
      reply: mergedPayload,
    });
    expect(wrote).toBe(true);
    result = await resumeWorkflow(result.runId, signalTwoWaitsWorkflow, args, base);
    expect(isSuspended(result)).toBe(true);
    expect(result.correlationId).not.toBe(firstCorrelation);

    const wroteClosed = await appendResolvedEntry({
      runsRoot,
      runId: result.runId,
      correlationId: result.correlationId,
      reply: closedPayload,
    });
    expect(wroteClosed).toBe(true);
    result = await resumeWorkflow(result.runId, signalTwoWaitsWorkflow, args, base);
    expect(isSuspended(result)).toBe(false);
    expect(result.result).toEqual({
      mergedTitle: "Fix the billing path",
      closedTitle: "Fix the billing path",
    });

    // Journal: ONE register (the binding fact) + ONE wait per awaited (signal, key).
    const { bySeq } = readJournalEntries(journalFilePath(runsRoot, result.runId));
    const sentKinds = [...bySeq.values()]
      .sort((a, b) => a.seq - b.seq)
      .map((e) => e.kind);
    expect(sentKinds).toEqual(["signal.register", "signal.wait", "signal.wait"]);

    // Replay of the completed run: the payload decodes from the journal, no envelope re-fires.
    const brokerSentCount = broker.sent.length;
    const replayed = await resumeWorkflow(
      result.runId,
      signalTwoWaitsWorkflow,
      args,
      base,
    );
    if (isSuspended(replayed)) throw new Error("a completed run must not re-suspend on replay");
    expect(replayed.result).toEqual(result.result);
    expect(broker.sent.length).toBe(brokerSentCount);
  });

  it("answers a live drain synchronously and dedupes the same (signal, key) to one handle", async () => {
    const broker = createMockBroker(resolveEveryWait);
    const base = { runsRoot, tools: [], broker, launchThreadId: "launch-thread" } as const;
    const args = { key: "42" };

    const result = await startWorkflow(signalKeyDedupeWorkflow, args, base);
    expect(isSuspended(result)).toBe(false);
    expect(result.result).toEqual({
      title: "Fix the billing path|Fix the billing path",
      mergedBy: "theo",
    });

    // Two awaits of the same (signal, key) journaled ONE `signal.wait` handle.
    const { bySeq } = readJournalEntries(journalFilePath(runsRoot, result.runId));
    const sentKinds = [...bySeq.values()].sort((a, b) => a.seq - b.seq).map((e) => e.kind);
    expect(sentKinds).toEqual(["signal.register", "signal.wait"]);
  });

  it("rejects getSignalSource without the source:<name> capability, before the broker", async () => {
    const broker = createMockBroker(deferEverything);
    const base = { runsRoot, tools: [], broker, launchThreadId: "launch-thread" } as const;
    const error = await startWorkflow(signalNoCapabilityWorkflow, { key: "42" }, base).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as PermissionDeniedError).message).toContain("source:scm.change-request.watch");
    expect(broker.sent).toHaveLength(0); // the gate fires before the broker is touched
  });
});
