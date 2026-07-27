/**
 * Model-cascade tests — the author-side half and, above all, its replay contract.
 *
 *   1. resolution      — a ladder fires ONE journaled `model.resolve` (kind + refId
 *                        `"model.resolve"`) and the winner lands on the following `thread.turn`.
 *   2. REPLAY          — a resume reuses the RECORDED choice: the broker is never re-fired, so a
 *                        registry that would now answer differently cannot change the run, and the
 *                        turn's `argsHash` is byte-stable.
 *   3. none available  — `{ selection: null }` keeps the run's default (no `model` on the turn) and
 *                        the reason is narrated through `log()`.
 *   4. absent option   — a body with no ladder fires no `model.resolve`, shifts no seq, and its
 *                        payload hashes equal `hashArgs` of a cascade-free payload.
 *   5. precedence      — an explicit `model` WINS; the ladder is never resolved.
 */

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { hashArgs } from "./t3team-sdk.canonicalJson.ts";
import {
  cleanupRunsRoot,
  modelCascadeAbsentWorkflow,
  modelCascadePrecedenceWorkflow,
  modelCascadeWorkflow,
  resetCounters,
  runsRoot,
} from "./t3team-sdk.engineFixtures.ts";
import {
  createMockBroker,
  type MessageEnvelope,
  type MockBrokerOutcome,
  resumeWorkflow,
  startWorkflow,
  type SuspendedResult,
  type WorkflowRunResult,
} from "./t3team-sdk.index.ts";
import { journalFilePath } from "./t3team-sdk.journal.ts";
import { readJournalEntries } from "./t3team-sdk.journalReader.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

type AnyResult<O> = WorkflowRunResult<O> | SuspendedResult;
function completed<O>(r: AnyResult<O>): O {
  if ("suspended" in r) throw new Error("expected a completed run");
  return r.result;
}

const selectionFor = (instanceId: string, id: string) => ({
  provider: instanceId,
  model: { kind: "model", id, provider: instanceId },
});

/** A host that answers `model.resolve` with `chosen` (or nothing) and every turn with "pass". */
function cascadeHost(chosen: { instanceId: string; id: string } | undefined, reason: string) {
  const probes: MessageEnvelope[] = [];
  const broker = createMockBroker((envelope): MockBrokerOutcome => {
    if (envelope.kind === "model.resolve") {
      probes.push(envelope);
      return {
        kind: "resolve",
        reply: {
          selection: chosen === undefined ? null : selectionFor(chosen.instanceId, chosen.id),
          reason,
        },
      };
    }
    if (envelope.kind === "thread.turn") return { kind: "resolve", reply: "pass" };
    return { kind: "defer" };
  });
  return { broker, probes };
}

const turnEnvelope = (broker: { sent: MessageEnvelope[] }): Record<string, unknown> =>
  (broker.sent.find((e) => e.kind === "thread.turn")?.payload ?? {}) as Record<string, unknown>;

const mapsOf = (runId: string) => readJournalEntries(journalFilePath(runsRoot, runId));
/** The `sent`/call lines in seq order — the shape the replay contract is asserted against. */
const sentOf = (runId: string) =>
  [...mapsOf(runId).bySeq.values()].toSorted((a, b) => a.seq - b.seq);
const resolvedOf = (runId: string) => [...mapsOf(runId).byCorrelation.values()];

describe("durable workflow engine — model cascade", () => {
  it("resolves the ladder once and hands the winner to the turn", async () => {
    const { broker, probes } = cascadeHost(
      { instanceId: "nexplore", id: "minimax-m2.7" },
      "chose #1 (nexplore/minimax-m2.7)",
    );
    const logs: string[] = [];
    const run = await startWorkflow(modelCascadeWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker,
      launchThreadId: "launch-thread",
      onLog: (message) => logs.push(message),
    });
    expect(completed(run)).toEqual({ verdict: "pass" });
    expect(probes).toHaveLength(1);
    // The ladder reaches the host in wire form: plain instance/model strings, in author order.
    const probed = probes[0]?.payload as { entries: unknown } | undefined;
    expect(probed?.entries).toEqual([
      { instanceId: "nexplore", model: "minimax-m2.7" },
      { instanceId: "claudeAgent" },
    ]);
    expect(turnEnvelope(broker)["model"]).toEqual(selectionFor("nexplore", "minimax-m2.7"));
    // The choice is narrated — a silent switch of brain is a debugging nightmare.
    expect(logs.some((line) => line.includes("chose #1 (nexplore/minimax-m2.7)"))).toBe(true);

    const journaled = sentOf(run.runId);
    expect(journaled.map((entry) => entry.kind)).toEqual([
      "thread.create",
      "model.resolve",
      "thread.turn",
    ]);
    expect(journaled[1]?.refId).toBe("model.resolve");
    // …and the winner is JOURNALED as the primitive's reply, which is what makes replay safe.
    const recorded = resolvedOf(run.runId).find((entry) => entry.kind === "model.resolve")
      ?.reply as { selection: unknown } | undefined;
    expect(recorded?.selection).toEqual(selectionFor("nexplore", "minimax-m2.7"));
  });

  it("REPLAY: a resume reuses the recorded choice and keeps the turn's argsHash stable", async () => {
    const first = cascadeHost(
      { instanceId: "nexplore", id: "minimax-m2.7" },
      "chose #1 (nexplore/minimax-m2.7)",
    );
    const run = await startWorkflow(modelCascadeWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker: first.broker,
      launchThreadId: "launch-thread",
    });
    const before = sentOf(run.runId);
    const turnHashBefore = before.find((e) => e.kind === "thread.turn")?.argsHash;

    // The registry has changed: this host would now pick the OTHER rung. The replay must not care.
    const second = cascadeHost(
      { instanceId: "claudeAgent", id: "claude-opus-4-8" },
      "chose #2 (claudeAgent)",
    );
    const resumed = await resumeWorkflow(run.runId, modelCascadeWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker: second.broker,
      launchThreadId: "launch-thread",
    });
    expect(completed(resumed)).toEqual({ verdict: "pass" });
    expect(second.probes).toHaveLength(0);
    expect(second.broker.sent).toHaveLength(0);
    const after = sentOf(run.runId);
    expect(after).toHaveLength(before.length);
    expect(after.find((e) => e.kind === "thread.turn")?.argsHash).toBe(turnHashBefore);
  });

  it("keeps the run's default selection when no rung is available", async () => {
    const { broker, probes } = cascadeHost(
      undefined,
      "no cascade entry is available; keeping the run's default claudeAgent/claude-opus-4-8",
    );
    const logs: string[] = [];
    const run = await startWorkflow(modelCascadeWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker,
      launchThreadId: "launch-thread",
      onLog: (message) => logs.push(message),
    });
    expect(completed(run)).toEqual({ verdict: "pass" });
    expect(probes).toHaveLength(1);
    // No `model` on the turn → the host uses the run's own selection. The step never fails.
    expect(turnEnvelope(broker)["model"]).toBeUndefined();
    expect(logs.some((line) => line.includes("no cascade entry is available"))).toBe(true);
  });

  it("journals nothing extra when the option is absent (byte-identical payload hashes)", async () => {
    const { broker, probes } = cascadeHost({ instanceId: "nexplore", id: "minimax-m2.7" }, "n/a");
    const run = await startWorkflow(modelCascadeAbsentWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker,
      launchThreadId: "launch-thread",
    });
    expect(completed(run)).toEqual({ verdict: "pass" });
    expect(probes).toHaveLength(0);
    const journaled = sentOf(run.runId);
    expect(journaled.map((entry) => entry.kind)).toEqual(["thread.create", "thread.turn"]);
    // The seqs are unshifted AND the hashes are those of cascade-free payloads: no `models` /
    // `model` key leaks into a non-opting author's journal.
    expect(journaled.map((entry) => entry.seq)).toEqual([1, 2]);
    const threadId = String((turnEnvelope(broker) as { threadId: unknown }).threadId);
    expect(journaled[0]?.argsHash).toBe(
      hashArgs({ name: "Judge gate", retention: "ephemeral" as const }),
    );
    expect(journaled[1]?.argsHash).toBe(
      hashArgs({ threadId, prompt: "judge this gate", label: "Judge gate" }),
    );
  });

  it("gives an explicit `model` precedence over the ladder", async () => {
    const { broker, probes } = cascadeHost({ instanceId: "nexplore", id: "minimax-m2.7" }, "n/a");
    const run = await startWorkflow(modelCascadePrecedenceWorkflow, undefined, {
      runsRoot,
      tools: [],
      broker,
      launchThreadId: "launch-thread",
    });
    expect(completed(run)).toEqual({ verdict: "pass" });
    expect(probes).toHaveLength(0);
    expect(turnEnvelope(broker)["model"]).toEqual(selectionFor("pinned", "pinned-a"));
    const journaled = sentOf(run.runId);
    expect(journaled.map((entry) => entry.kind)).toEqual(["thread.create", "thread.turn"]);
  });
});
