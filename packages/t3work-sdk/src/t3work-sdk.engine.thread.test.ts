/**
 * Thread-model tests (Epic 25 §The thread model). Every verb reduces to a `sent`/`resolved`
 * pair on the Handle dispatch:
 *   1. agent one-shot   — `agent(p)` + `agent(p,{schema})` = spawnThread().askAgent(); two
 *                          thread.create + thread.turn pairs, replays without re-firing.
 *   2. spawned thread    — spawnThread + askAgent(schema) + notifyAgent follow-up; the message
 *                          targets the spawned thread's id.
 *   3. suspend/resume    — thread.askUser, broker defers → SuspendedResult; appendResolvedEntry
 *                          + resumeWorkflow → completes with the validated reply.
 *   4. fire-and-forget   — spawnThread + notifyAgent + notifyUser record only sent entries.
 *   5. capability gate   — askUser without "user" → PermissionDeniedError, broker untouched.
 *   6. determinism       — the same body replays to the same correlationId.
 *   7. schema retry      — an ask whose replies never satisfy the schema → SchemaExhaustedError.
 *   8. decision card     — askUser with a choice schema + attachments carries the affordance
 *                          descriptor and the refs in the `user.input` payload.
 */

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  agentPrimitiveWorkflow,
  askChoiceJsonWorkflow,
  askChoiceWorkflow,
  askResponseWorkflow,
  childSpawnWorkflow,
  cleanupRunsRoot,
  fireForgetWorkflow,
  resetCounters,
  resolveTurnsBy,
  runsRoot,
  userAskDeniedWorkflow,
} from "./t3work-sdk.engineFixtures.ts";
import {
  appendResolvedEntry,
  createMockBroker,
  type MessageEnvelope,
  type MockBrokerOutcome,
  PermissionDeniedError,
  resumeWorkflow,
  SchemaExhaustedError,
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
  if (isSuspended(r))
    throw new Error(`expected a completed run, got SuspendedResult (${r.correlationId})`);
  return r.result;
}

const alwaysDefer = (): MockBrokerOutcome => ({ kind: "defer" });
const launchBase = (broker: ReturnType<typeof createMockBroker>) =>
  ({ runsRoot, tools: [], broker, launchThreadId: "launch-thread" }) as const;

describe("durable workflow engine — Thread model", () => {
  it("runs agent() one-shots (text + schema) and replays without re-firing the broker", async () => {
    const broker = createMockBroker(
      resolveTurnsBy([
        ["summarize cats", "cats are fine"],
        ["classify cats", { sentiment: "positive" }],
      ]),
    );
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(agentPrimitiveWorkflow, { topic: "cats" }, base);
    expect(completed(run)).toEqual({ summary: "cats are fine", sentiment: "positive" });
    // Two one-shots → two (thread.create + thread.turn) pairs.
    expect(broker.sent.map((e) => e.kind)).toEqual([
      "thread.create",
      "thread.turn",
      "thread.create",
      "thread.turn",
    ]);
    const { bySeq, byCorrelation } = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(bySeq.size).toBe(4);
    expect(byCorrelation.size).toBe(2); // the two turns resolved

    const resumed = await resumeWorkflow(
      run.runId,
      agentPrimitiveWorkflow,
      { topic: "cats" },
      base,
    );
    expect(completed(resumed)).toEqual({ summary: "cats are fine", sentiment: "positive" });
    expect(broker.sent).toHaveLength(4); // NOT re-fired on replay
  });

  it("spawns a thread, awaits a schema-typed turn, and posts a follow-up to that thread", async () => {
    const broker = createMockBroker(
      resolveTurnsBy([["summarize the thread", { summary: "all green" }]]),
    );
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(childSpawnWorkflow, {}, base);
    expect(completed(run)).toEqual({ summary: "all green" });

    const { bySeq, byCorrelation } = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(bySeq.get(1)).toMatchObject({ kind: "thread.create", phase: "sent" });
    expect(bySeq.get(2)).toMatchObject({ kind: "thread.turn", phase: "sent" });
    expect(bySeq.get(3)).toMatchObject({ kind: "thread.message", phase: "sent" });
    expect(byCorrelation.size).toBe(1); // only the turn was answered

    const followUp = broker.sent.find((e) => e.kind === "thread.message");
    expect((followUp?.payload as { threadId?: string }).threadId).toBe(`${run.runId}:1`);
  });

  it("suspends when thread.askUser defers, then resumes to completion once the reply lands", async () => {
    const broker = createMockBroker(alwaysDefer);
    const base = launchBase(broker);
    const run = await startWorkflow(askResponseWorkflow, { question: "ship it?" }, base);
    if (!isSuspended(run)) throw new Error("expected SuspendedResult");
    expect(run.correlationId).toBe(`${run.runId}:1`);
    expect(broker.sent.map((e) => e.kind)).toEqual(["user.input"]);

    const before = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(before.bySeq.size).toBe(1);
    expect(before.byCorrelation.size).toBe(0);

    // A freeform (text) ask journals the EXACT pre-decision-card payload — no affordance key — so
    // runs parked on an older askUser re-derive the same argsHash and still resume.
    expect(broker.sent[0]?.payload).not.toHaveProperty("affordance");
    expect(broker.sent[0]?.payload).not.toHaveProperty("attachments");

    const wrote = await appendResolvedEntry({
      runsRoot,
      runId: run.runId,
      correlationId: run.correlationId,
      reply: "approved",
    });
    expect(wrote).toBe(true);

    const resumed = await resumeWorkflow(
      run.runId,
      askResponseWorkflow,
      { question: "ship it?" },
      base,
    );
    expect(completed(resumed)).toEqual({ answer: "approved" });
    expect(broker.sent).toHaveLength(1); // the sent entry replayed, broker untouched
  });

  it("carries the affordance descriptor + attachments in the user.input payload and resumes with the chosen literal", async () => {
    const broker = createMockBroker(alwaysDefer);
    const base = launchBase(broker);
    const args = { question: "Release decision?" };
    const run = await startWorkflow(askChoiceWorkflow, args, base);
    if (!isSuspended(run)) throw new Error("expected SuspendedResult");

    expect(broker.sent.map((e) => e.kind)).toEqual(["user.input"]);
    const payload = broker.sent[0]?.payload as Record<string, unknown>;
    expect(payload["affordance"]).toEqual({
      kind: "choice",
      options: ["ship-now", "hold", "rollback"],
    });
    expect(payload["attachments"]).toEqual([
      {
        provider: "jira",
        kind: "issue",
        id: "BUG-7",
        displayId: "BUG-7",
        title: "Checkout rounding error",
        url: "https://example.atlassian.net/browse/BUG-7",
        status: "Open",
      },
    ]);

    // The host posts back the chosen literal (raw, as resolve-input appends it).
    await appendResolvedEntry({
      runsRoot,
      runId: run.runId,
      correlationId: run.correlationId,
      reply: "hold",
    });
    const resumed = await resumeWorkflow(run.runId, askChoiceWorkflow, args, base);
    expect(completed(resumed)).toEqual({ decision: "hold" });
    expect(broker.sent).toHaveLength(1); // replay does not re-fire the card
  });

  it("resolves a choice whose option literals are JSON-parseable strings without corrupting them", async () => {
    const broker = createMockBroker(alwaysDefer);
    const base = launchBase(broker);
    const args = { question: "Proceed?" };
    const run = await startWorkflow(askChoiceJsonWorkflow, args, base);
    if (!isSuspended(run)) throw new Error("expected SuspendedResult");

    // "true" is a valid offered option AND valid JSON — it must reach the literal decode as
    // the string "true", not be JSON-coerced into boolean true (which would exhaust the retry
    // loop on a legitimate button click).
    await appendResolvedEntry({
      runsRoot,
      runId: run.runId,
      correlationId: run.correlationId,
      reply: "true",
    });
    const resumed = await resumeWorkflow(run.runId, askChoiceJsonWorkflow, args, base);
    expect(completed(resumed)).toEqual({ confirmed: "true" });
    expect(broker.sent).toHaveLength(1); // resolved on the first attempt — no corrective re-ask
  });

  it("records only sent entries for fire-and-forget spawn/notify (never suspends)", async () => {
    const broker = createMockBroker(alwaysDefer);
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(fireForgetWorkflow, {}, base);
    expect(completed(run)).toEqual({ threadId: `${run.runId}:1` });

    const { bySeq, byCorrelation } = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(bySeq.size).toBe(3);
    expect(bySeq.get(1)).toMatchObject({ kind: "thread.create", phase: "sent" });
    expect(bySeq.get(2)).toMatchObject({ kind: "thread.message", phase: "sent" });
    expect(bySeq.get(3)).toMatchObject({ kind: "thread.message", phase: "sent" });
    expect(byCorrelation.size).toBe(0); // no replies, nothing to resolve
    expect(broker.sent.map((e) => e.kind)).toEqual([
      "thread.create",
      "thread.message",
      "thread.message",
    ]);
  });

  it("throws PermissionDeniedError when askUser is called without the 'user' capability", async () => {
    const broker = createMockBroker(alwaysDefer);
    const error = await startWorkflow(userAskDeniedWorkflow, {}, launchBase(broker)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as PermissionDeniedError).message).toContain("user");
    expect(broker.sent).toHaveLength(0); // the gate fires before the broker is touched
  });

  it("derives a deterministic correlationId ('<runId>:<seq>') that is stable across replay", async () => {
    const broker = createMockBroker(resolveTurnsBy([["id?", "stable"]]));
    const base = launchBase(broker);
    const run = await startWorkflow(askResponseWorkflow, { question: "id?" }, base);
    expect(completed(run)).toEqual({ answer: "stable" });
    const sent = readJournalEntries(journalFilePath(runsRoot, run.runId)).bySeq.get(1);
    expect(sent?.correlationId).toBe(`${run.runId}:1`);

    await resumeWorkflow(run.runId, askResponseWorkflow, { question: "id?" }, base);
    const after = readJournalEntries(journalFilePath(runsRoot, run.runId)).bySeq.get(1);
    expect(after?.correlationId).toBe(`${run.runId}:1`); // unchanged — re-derived identically
  });

  it("re-asks then throws SchemaExhaustedError when a reply never satisfies the schema", async () => {
    // Every thread.turn resolves with JSON that is missing the required `summary` field.
    const broker = createMockBroker(
      (envelope: MessageEnvelope): MockBrokerOutcome =>
        envelope.kind === "thread.turn" ? { kind: "resolve", reply: "{}" } : { kind: "defer" },
    );
    const base = { runsRoot, tools: [], broker } as const;
    const error = await startWorkflow(childSpawnWorkflow, {}, base).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SchemaExhaustedError);
    // 1 spawn + 3 turn attempts (one initial + two corrective re-asks).
    expect(broker.sent.filter((e) => e.kind === "thread.turn")).toHaveLength(3);
  });
});
