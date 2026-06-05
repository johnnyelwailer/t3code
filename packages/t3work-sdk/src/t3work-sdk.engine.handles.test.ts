/**
 * 25.4 Handle-pattern tests. Each side-effect primitive splits into a "sent" entry and a
 * "resolved" entry keyed by a deterministic correlationId. The six scenarios:
 *   1. round-trip      — ask, broker resolves synchronously, journal has sent+resolved,
 *                        resume replays both without re-firing the broker.
 *   2. suspend/resume  — ask, broker defers → SuspendedResult; appendResolvedEntry +
 *                        resumeWorkflow → body completes.
 *   3. fire-and-forget — ui.show (no schema) / user.notify record only a sent entry.
 *   4. capability gate — thread.send without "thread" throws PermissionDeniedError.
 *   5. dismiss         — a dismissed handle ignores a late reply.
 *   6. determinism     — the same body replays to the same correlationId.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  askResponseWorkflow,
  childSpawnWorkflow,
  cleanupRunsRoot,
  fireForgetWorkflow,
  handleDismissWorkflow,
  resetCounters,
  runsRoot,
  threadSendDeniedWorkflow,
} from "./t3work-sdk.engineFixtures.ts";
import {
  appendResolvedEntry,
  createHostBroker,
  createMockBroker,
  type MessageEnvelope,
  type MockBrokerOutcome,
  PermissionDeniedError,
  resumeWorkflow,
  startWorkflow,
  type SuspendedResult,
  type WorkflowRunResult,
} from "./t3work-sdk.index.ts";
import { journalFilePath } from "./t3work-sdk.journal.ts";
import { readJournalEntries } from "./t3work-sdk.journalReader.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

type AnyResult<O> = WorkflowRunResult<O> | SuspendedResult;
const isSuspended = <O>(r: AnyResult<O>): r is SuspendedResult => "suspended" in r;
function completed<O>(r: AnyResult<O>): O {
  if (isSuspended(r)) throw new Error(`expected a completed run, got SuspendedResult (${r.correlationId})`);
  return r.result;
}

/** A broker that resolves a given kind with a canned reply and defers everything else. */
const resolveKind = (kind: string, reply: unknown) => (envelope: MessageEnvelope): MockBrokerOutcome =>
  envelope.kind === kind ? { kind: "resolve", reply } : { kind: "defer" };
const alwaysDefer = (): MockBrokerOutcome => ({ kind: "defer" });

describe("durable workflow engine — 25.4 Handle pattern", () => {
  it("round-trips a user.ask: sent+resolved journaled, resume replays without re-firing", async () => {
    const broker = createMockBroker(resolveKind("user.ask", { answer: "yes" }));
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(askResponseWorkflow, { question: "ship it?" }, base);
    expect(completed(run)).toEqual({ answer: "yes" });
    expect(broker.sent).toHaveLength(1);
    expect(broker.sent[0]?.kind).toBe("user.ask");

    const { bySeq, byCorrelation } = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(bySeq.size).toBe(1);
    expect(bySeq.get(1)).toMatchObject({ kind: "user.ask", phase: "sent" });
    expect(byCorrelation.size).toBe(1);
    expect([...byCorrelation.values()][0]).toMatchObject({ reply: { answer: "yes" }, dismissed: false });

    const resumed = await resumeWorkflow(run.runId, askResponseWorkflow, { question: "ship it?" }, base);
    expect(completed(resumed)).toEqual({ answer: "yes" });
    expect(broker.sent).toHaveLength(1); // NOT re-fired on replay
  });

  it("suspends when the broker defers, then resumes to completion once the reply lands", async () => {
    const broker = createMockBroker(alwaysDefer);
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(askResponseWorkflow, { question: "later?" }, base);
    if (!isSuspended(run)) throw new Error("expected SuspendedResult");
    expect(run.suspended).toBe(true);
    expect(run.correlationId).toBe(`${run.runId}:1`);
    expect(broker.sent).toHaveLength(1);

    // The journal holds the sent entry but no resolved entry yet.
    const before = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(before.bySeq.size).toBe(1);
    expect(before.byCorrelation.size).toBe(0);

    // The external reply lands: the host appends a resolved entry, then resumes.
    const wrote = appendResolvedEntry({
      runsRoot,
      runId: run.runId,
      correlationId: run.correlationId,
      reply: { answer: "approved" },
    });
    expect(wrote).toBe(true);

    const resumed = await resumeWorkflow(run.runId, askResponseWorkflow, { question: "later?" }, base);
    expect(completed(resumed)).toEqual({ answer: "approved" });
    expect(broker.sent).toHaveLength(1); // the sent entry replayed, broker untouched
  });

  it("records only a sent entry for fire-and-forget ui.show / user.notify (never suspends)", async () => {
    const broker = createMockBroker(alwaysDefer);
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(fireForgetWorkflow, {}, base);
    const out = completed(run);
    expect(out.bannerId).toBe(`${run.runId}:1`);
    expect(out.noteId).toBe(`${run.runId}:2`);

    const { bySeq, byCorrelation } = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(bySeq.size).toBe(2);
    expect(bySeq.get(1)).toMatchObject({ kind: "ui.show", phase: "sent" });
    expect(bySeq.get(2)).toMatchObject({ kind: "user.notify", phase: "sent" });
    expect(byCorrelation.size).toBe(0); // no replies, nothing to resolve
    expect(broker.sent.map((e) => e.kind)).toEqual(["ui.show", "user.notify"]);
  });

  it("throws PermissionDeniedError when thread.send is called without the 'thread' capability", async () => {
    const broker = createMockBroker(alwaysDefer);
    const error = await startWorkflow(threadSendDeniedWorkflow, {}, { runsRoot, tools: [], broker }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as PermissionDeniedError).message).toContain("thread");
    expect(broker.sent).toHaveLength(0); // the gate fires before the broker is touched
  });

  it("dismiss() records a terminal resolution so a late reply is ignored", async () => {
    const broker = createMockBroker(alwaysDefer);
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(handleDismissWorkflow, {}, base);
    const out = completed(run);
    expect(out.dismissed).toBe(true);
    const correlationId = out.id;

    const afterDismiss = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(afterDismiss.byCorrelation.get(correlationId)).toMatchObject({ dismissed: true });

    // A late reply for the dismissed handle is rejected (first-write-wins).
    const wrote = appendResolvedEntry({ runsRoot, runId: run.runId, correlationId, reply: { answer: "too late" } });
    expect(wrote).toBe(false);

    const resumed = await resumeWorkflow(run.runId, handleDismissWorkflow, {}, base);
    expect(completed(resumed)).toEqual({ id: correlationId, dismissed: true });
    const final = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(final.byCorrelation.get(correlationId)).toMatchObject({ dismissed: true });
  });

  it("derives a deterministic correlationId ('<runId>:<seq>') that is stable across replay", async () => {
    const broker = createMockBroker(resolveKind("user.ask", { answer: "stable" }));
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(askResponseWorkflow, { question: "id?" }, base);
    completed(run);
    const sent = readJournalEntries(journalFilePath(runsRoot, run.runId)).bySeq.get(1);
    expect(sent?.correlationId).toBe(`${run.runId}:1`);

    await resumeWorkflow(run.runId, askResponseWorkflow, { question: "id?" }, base);
    const after = readJournalEntries(journalFilePath(runsRoot, run.runId)).bySeq.get(1);
    expect(after?.correlationId).toBe(`${run.runId}:1`); // unchanged — re-derived identically
  });

  it("round-trips child.spawn (await reply) and a fire-and-forget thread.send to the child", async () => {
    const broker = createMockBroker(resolveKind("child.spawn", { summary: "all green" }));
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(childSpawnWorkflow, {}, base);
    expect(completed(run)).toEqual({ summary: "all green" });

    const { bySeq, byCorrelation } = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(bySeq.get(1)).toMatchObject({ kind: "child.spawn", phase: "sent" });
    expect(bySeq.get(2)).toMatchObject({ kind: "thread.send", phase: "sent" });
    expect(byCorrelation.size).toBe(1); // only child.spawn was answered
    const followUp = broker.sent.find((e) => e.kind === "thread.send");
    expect(followUp?.target).toEqual({ kind: "child", id: `${run.runId}:1` });
  });

  it("createHostBroker fires per-kind handlers; replies settle out of band, no re-fire on resume", async () => {
    const fired: string[] = [];
    const broker = createHostBroker({
      "child.spawn": async (e) => {
        fired.push(`child.spawn:${e.correlationId}`);
      },
      "thread.send": async (e) => {
        fired.push(`thread.send:${JSON.stringify(e.target)}`);
      },
    });
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(childSpawnWorkflow, {}, base);
    if (!isSuspended(run)) throw new Error("expected suspension awaiting the child reply");
    expect(run.correlationId).toBe(`${run.runId}:1`);
    // The spawn fired; the body suspended before reaching the follow-up thread.send.
    expect(fired).toEqual([`child.spawn:${run.runId}:1`]);

    appendResolvedEntry({
      runsRoot,
      runId: run.runId,
      correlationId: run.correlationId,
      reply: { summary: "done" },
    });
    const resumed = await resumeWorkflow(run.runId, childSpawnWorkflow, {}, base);
    expect(completed(resumed)).toEqual({ summary: "done" });
    // Resume replayed the spawn (NOT re-fired) and fired the follow-up to the child handle.
    expect(fired).toEqual([
      `child.spawn:${run.runId}:1`,
      `thread.send:{"kind":"child","id":"${run.runId}:1"}`,
    ]);
  });
});
