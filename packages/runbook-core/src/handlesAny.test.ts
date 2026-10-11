import { describe, expect, it } from "vite-plus/test";

import { hashArgs } from "./canonicalJson.ts";
import { createDurableRuntime, type DurablePrimitiveRuntime } from "./durableRuntime.ts";
import { ReplayDriftError, WorkflowAborted, WorkflowError } from "./errors.ts";
import { createRefireTarget, WorkflowSuspended, type ReplyResolver } from "./handles.ts";
import { anyWinner, awaitAny, type AnyBranch } from "./handlesAny.ts";
import { buildJournalMaps } from "./journalReader.ts";
import type { JournalSink } from "./journalStore.ts";
import { toResolvedWire, toWire } from "./journalWriter.ts";

const source = { now: () => 1_700_000_000_000, random: () => 0.5, uuid: () => "uuid-1" };
const nowIso = () => "2026-10-07T00:00:00.000Z";
const KIND = "signal.waitAny";
/** The any-wait is the body's second journaled call, so its correlation is fixed. */
const ANY_ID = "run-1:2";

const branch = (name: string): AnyBranch<string> => ({
  args: { signal: name },
  decode: (reply) => {
    if (typeof reply !== "string") throw new Error(`branch ${name}: not a string`);
    return `${name.toUpperCase()}:${reply}`;
  },
});
const BRANCHES = [branch("merged"), branch("closed"), branch("checks")];

/** The run's journal as raw wire lines — what a durable store holds between drives. */
function makeLog() {
  const wires: Array<Record<string, unknown>> = [];
  const sink: JournalSink = {
    append: (entry) => void wires.push(toWire(entry)),
    appendResolved: (input) => void wires.push(toResolvedWire(input)),
    flush: async () => {},
    dispose: () => {},
  };
  return { wires, sink };
}
type Log = ReturnType<typeof makeLog>;

/** One drive over the recorded lines: a fresh runtime, exactly what a resume builds. */
function drive(log: Log, opts: { abortSignal?: AbortSignal; refire?: string } = {}) {
  const maps = buildJournalMaps(log.wires);
  return createDurableRuntime({
    journal: maps.bySeq,
    resolved: maps.byCorrelation,
    writer: log.sink,
    source,
    nowIso,
    runId: "run-1",
    abortSignal: opts.abortSignal,
    refire: opts.refire === undefined ? undefined : createRefireTarget(opts.refire),
  });
}

/** The host appending a winner out of band — the delivery port's journal write. */
const deliver = (log: Log, index: number, reply: unknown) =>
  log.sink.appendResolved({
    correlationId: ANY_ID,
    kind: KIND,
    refId: "any",
    reply: anyWinner(index, reply),
    startedAt: nowIso(),
    endedAt: nowIso(),
  });

type Fire = (correlationId: string, resolver: ReplyResolver) => Promise<void>;

async function body(runtime: DurablePrimitiveRuntime, fire: Fire, branches = BRANCHES) {
  await runtime.callPrimitive({ kind: "tool", refId: "lookup", args: null, exec: async () => 1 });
  return await awaitAny(runtime.handles, { kind: KIND, refId: "any", branches, fire });
}

function deferringBroker() {
  const fired: string[] = [];
  const fire: Fire = async (correlationId) => void fired.push(correlationId);
  return { fired, fire };
}

describe("@runbook/core any-of ask", () => {
  it("parks on ONE composite correlation and resumes on a non-first branch", async () => {
    const log = makeLog();
    const broker = deferringBroker();

    const first = drive(log);
    await expect(body(first, broker.fire)).rejects.toBeInstanceOf(WorkflowSuspended);
    expect(first.suspension.armed()?.correlationId).toBe(ANY_ID);
    expect(first.suspension.armed()?.blackBoxed).toBe(false);
    const sent = log.wires.filter((wire) => wire.phase === "sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ seq: 2, kind: KIND, correlationId: ANY_ID });
    expect(sent[0]!.argsHash).toBe(hashArgs({ branches: BRANCHES.map((b) => b.args) }));

    deliver(log, 2, "green");
    const hit = await body(drive(log), broker.fire);
    expect(hit).toEqual({ index: 2, value: "CHECKS:green" });
    expect(broker.fired).toEqual([ANY_ID]); // replay never re-fires the composite
  });

  it("returns the journaled winner on every replay, however many branches resolve later", async () => {
    const log = makeLog();
    const broker = deferringBroker();
    await expect(body(drive(log), broker.fire)).rejects.toBeInstanceOf(WorkflowSuspended);
    deliver(log, 1, "closed-first");
    // A racing host process writes a losing branch's line anyway: first write still wins.
    deliver(log, 0, "merged-later");
    deliver(log, 2, "checks-later");

    for (let replay = 0; replay < 3; replay += 1) {
      expect(await body(drive(log), broker.fire)).toEqual({
        index: 1,
        value: "CLOSED:closed-first",
      });
    }
  });

  it("keeps the first synchronous settle when two branches land during the fire", async () => {
    const log = makeLog();
    const fire: Fire = async (_correlationId, resolver) => {
      resolver.resolve(anyWinner(1, "drained"));
      resolver.resolve(anyWinner(0, "too-late"));
    };
    expect(await body(drive(log), fire)).toEqual({ index: 1, value: "CLOSED:drained" });
    expect(log.wires.filter((wire) => wire.phase === "resolved")).toHaveLength(1);
    expect(await body(drive(log), deferringBroker().fire)).toEqual({
      index: 1,
      value: "CLOSED:drained",
    });
  });

  it("aborts before taking a seq: nothing journaled, nothing fired", async () => {
    const log = makeLog();
    const broker = deferringBroker();
    const controller = new AbortController();
    controller.abort();
    const runtime = drive(log, { abortSignal: controller.signal });
    await expect(
      awaitAny(runtime.handles, {
        kind: KIND,
        refId: "any",
        branches: BRANCHES,
        fire: broker.fire,
      }),
    ).rejects.toBeInstanceOf(WorkflowAborted);
    expect(runtime.currentSeq()).toBe(0);
    expect(log.wires).toEqual([]);
    expect(broker.fired).toEqual([]);
  });

  it("stays parked when the body swallows the suspension (sticky latch)", async () => {
    const log = makeLog();
    const broker = deferringBroker();
    const runtime = drive(log);
    let caught: unknown;
    try {
      await body(runtime, broker.fire);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkflowSuspended);
    const lines = log.wires.length;
    await expect(
      awaitAny(runtime.handles, {
        kind: KIND,
        refId: "any",
        branches: BRANCHES,
        fire: broker.fire,
      }),
    ).rejects.toBe(caught);
    expect(log.wires).toHaveLength(lines);
    expect(broker.fired).toEqual([ANY_ID]);
  });

  it("parks unresumably inside a black box, journaling nothing", async () => {
    const log = makeLog();
    const runtime = drive(log);
    await expect(
      runtime.runBlackBoxed(() =>
        awaitAny(runtime.handles, {
          kind: KIND,
          refId: "any",
          branches: BRANCHES,
          fire: deferringBroker().fire,
        }),
      ),
    ).rejects.toBeInstanceOf(WorkflowSuspended);
    expect(runtime.suspension.armed()?.blackBoxed).toBe(true);
    expect(log.wires).toEqual([]);
  });

  it("fails loud on a reordered branch list instead of reading the winner against it", async () => {
    const log = makeLog();
    await expect(body(drive(log), deferringBroker().fire)).rejects.toBeInstanceOf(
      WorkflowSuspended,
    );
    deliver(log, 0, "merged");
    const reordered = [BRANCHES[1]!, BRANCHES[0]!, BRANCHES[2]!];
    await expect(body(drive(log), deferringBroker().fire, reordered)).rejects.toBeInstanceOf(
      ReplayDriftError,
    );
  });

  it("refuses an empty list, a duplicate branch, and a malformed winner", async () => {
    const empty = drive(makeLog());
    const fire = deferringBroker().fire;
    await expect(
      awaitAny(empty.handles, { kind: KIND, refId: "any", branches: [], fire }),
    ).rejects.toBeInstanceOf(WorkflowError);
    const duplicate = drive(makeLog());
    await expect(
      awaitAny(duplicate.handles, {
        kind: KIND,
        refId: "any",
        branches: [branch("merged"), branch("closed"), branch("merged")],
        fire,
      }),
    ).rejects.toThrow(/branch 2 duplicates branch 0/);
    expect(empty.currentSeq() + duplicate.currentSeq()).toBe(0);

    const log = makeLog();
    await expect(body(drive(log), fire)).rejects.toBeInstanceOf(WorkflowSuspended);
    deliver(log, 3, "out-of-range");
    await expect(body(drive(log), fire)).rejects.toThrow(/Malformed any-wait reply/);
  });

  it("refuses to re-fire an any-wait: re-registering its branches is a side effect", async () => {
    const log = makeLog();
    await expect(body(drive(log), deferringBroker().fire)).rejects.toBeInstanceOf(
      WorkflowSuspended,
    );
    await expect(body(drive(log, { refire: ANY_ID }), deferringBroker().fire)).rejects.toThrow(
      /not a re-sendable ask kind/,
    );
  });
});
