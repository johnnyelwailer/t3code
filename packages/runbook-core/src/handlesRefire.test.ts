import { describe, expect, it } from "vite-plus/test";

import { hashArgs } from "./canonicalJson.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import { createWorkflowEngine } from "./engine.ts";
import type { WorkflowReference } from "./engineTypes.ts";
import { createRefireTarget, type FireDelivery } from "./handles.ts";
import { buildJournalMaps } from "./journalReader.ts";
import type { JournalStore } from "./journalStore.ts";
import { toResolvedWire, toWire, type ResolvedWireInput } from "./journalWriter.ts";

/** An in-memory store whose raw wire lines the tests read back directly. */
class MemoryJournalStore implements JournalStore {
  readonly wires: Array<Record<string, unknown>> = [];
  private readonly metas = new Map<string, Parameters<JournalStore["writeRunMeta"]>[1]>();
  async appendEntry(_runId: string, entry: Parameters<JournalStore["appendEntry"]>[1]) {
    this.wires.push(toWire(entry));
  }
  async appendResolved(_runId: string, resolved: ResolvedWireInput) {
    this.wires.push(toResolvedWire(resolved));
  }
  async readEntries() {
    return buildJournalMaps(this.wires);
  }
  async readRunMeta(runId: string) {
    return this.metas.get(runId);
  }
  async writeRunMeta(runId: string, meta: Parameters<JournalStore["writeRunMeta"]>[1]) {
    this.metas.set(runId, meta);
  }
  async hasRun(runId: string) {
    return this.metas.has(runId);
  }
  async clear(runId: string) {
    this.wires.length = 0;
    this.metas.delete(runId);
  }
  locator(runId: string) {
    return `memory://${runId}`;
  }
}

type BrokerMode = "defer" | "resolve" | "crash";
interface Fired {
  readonly correlationId: string;
  readonly payload: string;
  readonly delivery: FireDelivery | undefined;
}

const source = { now: () => 1_700_000_000_000, random: () => 0.5, uuid: () => "uuid-1" };
const nowIso = () => "2026-09-23T00:00:00.000Z";
const ARGS = { prompt: "Summarize the change", model: "m-1" };

/**
 * A two-step host: one journaled lookup, then one ask. `broker.mode` decides what each fire of
 * the ask does; `skipAsk` makes a later drive diverge from the journal before reaching the ask.
 */
function makeHost() {
  const store = new MemoryJournalStore();
  const fired: Fired[] = [];
  const broker = { mode: "defer" as BrokerMode, reply: "done" as unknown, skipAsk: false };
  let lookups = 0;
  const engine = createWorkflowEngine<WorkflowReference, { store?: JournalStore; refire?: string }>(
    {
      workflowPath: (ref) => ref.path,
      defaultRunsRoot: () => "/unused",
      createStore: () => store,
      newRunId: () => "run-1",
      nowIso,
      executeBody: async (request) => {
        const runtime = createDurableRuntime({
          journal: request.journal.bySeq,
          resolved: request.journal.byCorrelation,
          writer: request.sink,
          source,
          nowIso,
          runId: request.runId,
          suspension: request.suspension,
          refire: request.refire,
        });
        await runtime.callPrimitive({
          kind: "tool",
          refId: "lookup",
          args: null,
          exec: async () => (lookups += 1),
        });
        if (broker.skipAsk) return "skipped";
        const id = await runtime.handles.send({
          kind: "thread.turn",
          refId: "thread.turn",
          args: ARGS,
          fire: async (correlationId, resolver, delivery) => {
            fired.push({ correlationId, payload: JSON.stringify(ARGS), delivery });
            if (broker.mode === "crash") throw new Error("host crashed mid-send");
            if (broker.mode === "resolve") resolver.resolve(broker.reply);
          },
        });
        return await runtime.handles.awaitResolution(id, undefined);
      },
    },
  );
  const ref: WorkflowReference = { path: "refire.workflow.ts" };
  const start = () => engine.startWorkflow(ref, {}, { store });
  const resume = (refire?: string) =>
    engine.resumeWorkflow("run-1", ref, {}, refire === undefined ? { store } : { store, refire });
  return { store, fired, broker, start, resume, lookups: () => lookups };
}

describe("@runbook/core opt-in re-fire of a recorded ask", () => {
  it("re-sends at the same seq and correlationId, byte-identical, journaling nothing until the reply", async () => {
    const host = makeHost();
    expect(await host.start()).toEqual({
      runId: "run-1",
      suspended: true,
      correlationId: "run-1:2",
    });
    const sentLine = host.store.wires.find((wire) => wire.phase === "sent");
    const journaledBefore = host.store.wires.length;

    // The failed step's re-fire: the broker is called again, the run parks on the SAME ask.
    expect(await host.resume("run-1:2")).toEqual({
      runId: "run-1",
      suspended: true,
      correlationId: "run-1:2",
    });
    expect(host.store.wires).toHaveLength(journaledBefore); // nothing journaled by the re-fire
    expect(host.fired).toHaveLength(2);
    const [first, again] = host.fired;
    expect(again?.correlationId).toBe(first?.correlationId);
    expect(again?.payload).toBe(first?.payload); // byte-identical payload
    expect(sentLine?.argsHash).toBe(hashArgs(JSON.parse(again?.payload ?? "null")));
    // The redelivery marker reaches the fire callback only on the re-fire.
    expect(first?.delivery).toBeUndefined();
    expect(again?.delivery).toEqual({ redelivery: true });
    expect(host.lookups()).toBe(1); // replayed, never re-executed

    // The reply to the re-fire resolves the ORIGINAL correlationId and completes the run.
    host.broker.mode = "resolve";
    expect(await host.resume("run-1:2")).toEqual({ runId: "run-1", result: "done" });
    const resolved = host.store.wires.filter((wire) => wire.phase === "resolved");
    expect(resolved.map((wire) => wire.correlationId)).toEqual(["run-1:2"]);
    expect(host.store.wires.filter((wire) => wire.phase === "sent")).toHaveLength(1);
  });

  it("leaves the ask open after a crash between re-fire and reply, so it can be re-fired again", async () => {
    const host = makeHost();
    await host.start();
    const journaledBefore = host.store.wires.length;
    host.broker.mode = "crash";
    await expect(host.resume("run-1:2")).rejects.toThrow("host crashed mid-send");
    expect(host.store.wires).toHaveLength(journaledBefore);

    host.broker.mode = "defer";
    expect(await host.resume("run-1:2")).toMatchObject({ suspended: true });
    host.broker.mode = "resolve";
    expect(await host.resume("run-1:2")).toEqual({ runId: "run-1", result: "done" });
    expect(host.fired.map((fire) => fire.delivery?.redelivery ?? false)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it("refuses a target the journal never recorded, before the body runs", async () => {
    const host = makeHost();
    await host.start();
    await expect(host.resume("run-1:99")).rejects.toThrow("no recorded ask");
    expect(host.fired).toHaveLength(1);
    expect(host.lookups()).toBe(1);
  });

  it("refuses a target that already has a reply", async () => {
    const host = makeHost();
    host.broker.mode = "resolve";
    expect(await host.start()).toEqual({ runId: "run-1", result: "done" });
    await expect(host.resume("run-1:2")).rejects.toThrow("already has a journaled reply");
    expect(host.fired).toHaveLength(1);
  });

  it("fails closed when the replay completes without reaching the target", async () => {
    const host = makeHost();
    await host.start();
    host.broker.skipAsk = true;
    await expect(host.resume("run-1:2")).rejects.toThrow("without reaching its re-fire target");
    expect(host.fired).toHaveLength(1);
  });

  it("refuses every non-ask kind before the body runs: no re-schedule, no re-register, no one-way re-send", async () => {
    // One unanswered `sent` entry per kind. Their fires carry side effects of their own
    // (`wait.until` schedules, `signal.wait` registers) or await no reply (one-way sends).
    const store = new MemoryJournalStore();
    let bodyRuns = 0;
    let fires = 0;
    const fire = async () => {
      fires += 1;
    };
    const engine = createWorkflowEngine<
      WorkflowReference,
      { store?: JournalStore; refire?: string }
    >({
      workflowPath: (ref) => ref.path,
      defaultRunsRoot: () => "/unused",
      createStore: () => store,
      newRunId: () => "run-1",
      nowIso,
      executeBody: async (request) => {
        bodyRuns += 1;
        const runtime = createDurableRuntime({
          journal: request.journal.bySeq,
          resolved: request.journal.byCorrelation,
          writer: request.sink,
          source,
          nowIso,
          runId: request.runId,
          suspension: request.suspension,
          refire: request.refire,
        });
        runtime.handles.sendOneWay({
          kind: "thread.create",
          refId: "thread.create",
          args: 1,
          fire,
        });
        runtime.handles.sendOneWay({
          kind: "thread.message",
          refId: "thread.message",
          args: 2,
          fire,
        });
        for (const kind of ["wait.until", "model.resolve", "signal.wait"]) {
          await runtime.handles.send({ kind, refId: kind, args: kind, fire });
        }
        return "sent all";
      },
    });
    const ref: WorkflowReference = { path: "kinds.workflow.ts" };
    expect(await engine.startWorkflow(ref, {}, { store })).toEqual({
      runId: "run-1",
      result: "sent all",
    });
    const sent = store.wires.filter((wire) => wire.phase === "sent");
    expect(sent.map((wire) => wire.kind)).toEqual([
      "thread.create",
      "thread.message",
      "wait.until",
      "model.resolve",
      "signal.wait",
    ]);
    for (const wire of sent) {
      await expect(
        engine.resumeWorkflow("run-1", ref, {}, { store, refire: String(wire.correlationId) }),
      ).rejects.toThrow(`it is a '${String(wire.kind)}' entry; only thread.turn / user.input`);
    }
    expect(bodyRuns).toBe(1); // every refusal happened before the body ran
    expect(fires).toBe(5); // the original fires only — nothing was re-sent
  });

  it("refuses a refire on a fresh start", async () => {
    const host = makeHost();
    const engineStart = createWorkflowEngine<WorkflowReference, { refire?: string }>({
      workflowPath: (ref) => ref.path,
      defaultRunsRoot: () => "/unused",
      createStore: () => host.store,
      newRunId: () => "run-1",
      nowIso,
      executeBody: async () => "ran",
    }).startWorkflow;
    await expect(engineStart({ path: "x" }, {}, { refire: "run-1:1" })).rejects.toThrow(
      "fresh run has none",
    );
    expect(host.store.wires).toEqual([]);
  });

  it("guards the dispatch itself: black box, one-way, and an answered ask all refuse", async () => {
    const fire = async () => {
      throw new Error("must not fire");
    };
    const sink = {
      append: () => {},
      appendResolved: () => {},
      flush: async () => {},
      dispose: () => {},
    };
    const inBox = createDurableRuntime({
      journal: new Map(),
      writer: sink,
      source,
      runId: "run-1",
      refire: createRefireTarget("run-1:blackbox:1"),
    });
    await expect(
      inBox.runBlackBoxed(() =>
        inBox.handles.send({ kind: "thread.turn", refId: "t", args: 1, fire }),
      ),
    ).rejects.toThrow("parallel()/pipeline()");

    const wires: Array<Record<string, unknown>> = [];
    const first = createDurableRuntime({
      journal: new Map(),
      writer: { ...sink, append: (entry) => wires.push(toWire(entry)) },
      source,
      runId: "run-1",
    });
    first.handles.sendOneWay({ kind: "thread.message", refId: "m", args: 1, fire: async () => {} });
    await first.handles.send({ kind: "thread.turn", refId: "t", args: 2, fire: async () => {} });
    const maps = buildJournalMaps(wires);
    const replay = (target: string, resolved = maps.byCorrelation) =>
      createDurableRuntime({
        journal: maps.bySeq,
        resolved,
        writer: sink,
        source,
        runId: "run-1",
        refire: createRefireTarget(target),
      });
    expect(() =>
      replay("run-1:1").handles.sendOneWay({ kind: "thread.message", refId: "m", args: 1, fire }),
    ).toThrow("one-way send");

    const answered = new Map([
      [
        "run-1:2",
        {
          correlationId: "run-1:2",
          kind: "thread.turn" as const,
          refId: "t",
          dismissed: false,
          reply: "x",
        },
      ],
    ]);
    const done = replay("run-1:2", answered);
    done.handles.sendOneWay({ kind: "thread.message", refId: "m", args: 1, fire });
    await expect(
      done.handles.send({ kind: "thread.turn", refId: "t", args: 2, fire }),
    ).rejects.toThrow("already has a journaled reply");

    // Defense in depth below the run boundary: a non-ask `send` kind refuses at the dispatch too.
    const waitWires: Array<Record<string, unknown>> = [];
    const waited = createDurableRuntime({
      journal: new Map(),
      writer: { ...sink, append: (entry) => waitWires.push(toWire(entry)) },
      source,
      runId: "run-1",
    });
    await waited.handles.send({ kind: "wait.until", refId: "w", args: 1, fire: async () => {} });
    const waitMaps = buildJournalMaps(waitWires);
    const rewait = createDurableRuntime({
      journal: waitMaps.bySeq,
      resolved: waitMaps.byCorrelation,
      writer: sink,
      source,
      runId: "run-1",
      refire: createRefireTarget("run-1:1"),
    });
    await expect(
      rewait.handles.send({ kind: "wait.until", refId: "w", args: 1, fire }),
    ).rejects.toThrow("'wait.until' is not a re-sendable ask kind");
  });
});
