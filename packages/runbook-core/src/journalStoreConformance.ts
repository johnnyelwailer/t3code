/**
 * Bounded execution — the host-neutral conformance suite for the `JournalStore`
 * replay-window contract (multi-host wave 1, skeleton A/B).
 *
 * `docs/runbook/bounded-execution.md` makes the checkpoint-aware replay window a core-owned
 * contract: every `JournalStore` backend — filesystem, SQLite, Postgres, or a host-adapter
 * journal — must hand a resume the BOUNDED suffix (the entries strictly after the latest
 * valid checkpoint) plus the full correlation map, not the lifetime journal. This suite is
 * the proof a host runs against its own store:
 *
 *   A — window semantics: the store's `readReplayWindow` matches the shared reference
 *       selection (`selectReplayWindow`) on every fixture, materializes only the bounded
 *       suffix, and rehydrates deterministically across repeat reads.
 *   B — resume behavior: the generic engine (`executeWorkflowRun`) replays only that
 *       suffix when a window exists (no full replay), seeds the seq counter at the
 *       boundary, and fails loud with a `WorkflowError` when the store cannot honor the
 *       window (an unsettled resolvable ask in the collapsed prefix).
 *
 * A host adapter wires this into its test suite with one call — `runReplayWindowConformance(store)`
 * — against a fresh store of its own backend (wave 2: the Temporal/Mastra Postgres host in
 * the service process). The fixtures are deterministic by construction: fixed timestamps,
 * fixed correlation ids, no live-clock reads anywhere in the suite.
 */

import { WorkflowError } from "./errors.ts";
import type { WorkflowReference } from "./engineTypes.ts";
import type { JournalEntry } from "./journalReader.ts";
import type { JournalStore } from "./journalStore.ts";
import type { ExecuteBodyRequest } from "./runEngine.ts";
import { executeWorkflowRun } from "./runEngine.ts";
import {
  CHECKPOINT_KIND,
  CHECKPOINT_REF_ID,
  selectReplayWindow,
  type ReplayWindow,
} from "./checkpoint.ts";
import type { ResolvedWireInput } from "./journalWriter.ts";

/** One passing check in the report, formatted "<runId>: <label>". */
export interface ReplayWindowConformanceReport {
  /** A stable locator for the store under test (its `locator()` for the fixture runs). */
  readonly store: string;
  /** One entry per check that passed. */
  readonly passed: readonly string[];
}

const NOW_ISO = "2026-09-01T00:00:00.000Z";

/** The body the engine re-drives on a B-resume; records what the engine handed it. */
interface ResumeObservation {
  readonly suffixSeqs: readonly number[];
  readonly fromSeq: number | undefined;
  readonly state: unknown;
}

interface ConformanceFixture {
  readonly id: string;
  readonly runId: string;
  readonly entries: readonly JournalEntry[];
  readonly resolved: readonly ResolvedWireInput[];
  /** The seq of the latest VALID checkpoint boundary (undefined when none is valid). */
  readonly boundarySeq: number | undefined;
  /** The seqs that must be materialized: the strict suffix after the boundary, else the full journal. */
  readonly expectedSuffixSeqs: readonly number[];
  /** The compact state the active boundary carries (for the engine rehydration check). */
  readonly expectedState?: unknown;
  /** Resolvable asks in the collapsed prefix with no recorded reply. */
  readonly expectedUnresolved: readonly string[];
  /** The engine-level check this fixture drives. */
  readonly engine?: "resume" | "unsafe";
}

const entry = (
  seq: number,
  kind: string,
  result: unknown,
  extra: Partial<JournalEntry> = {},
): JournalEntry => ({
  seq,
  callId: `${seq}:${kind}:conformance`,
  kind,
  refId: kind === CHECKPOINT_KIND ? CHECKPOINT_REF_ID : "conformance",
  argsHash: `args-${seq}`,
  result,
  startedAt: NOW_ISO,
  endedAt: NOW_ISO,
  ...extra,
});

const checkpointEntry = (seq: number, compactedThroughSeq: number, state: unknown): JournalEntry =>
  entry(seq, CHECKPOINT_KIND, { compactedThroughSeq, state, retainedHistory: 0, at: NOW_ISO });

/** A structurally invalid checkpoint result — a corrupt later boundary must never be authority. */
const corruptCheckpointEntry = (seq: number): JournalEntry =>
  entry(seq, CHECKPOINT_KIND, {
    compactedThroughSeq: "not-a-seq",
    state: {},
    retainedHistory: 0,
    at: NOW_ISO,
  });

const reply = (correlationId: string, kind: string, replyValue: unknown): ResolvedWireInput => ({
  correlationId,
  kind,
  refId: "conformance",
  reply: replyValue,
  startedAt: NOW_ISO,
  endedAt: NOW_ISO,
});

const LONG_LIVED_ITERATIONS = 200;
const longLivedEntries: JournalEntry[] = [];
for (let iteration = 1; iteration <= LONG_LIVED_ITERATIONS; iteration++) {
  longLivedEntries.push(entry(2 * iteration - 1, "tool", `iteration-${iteration}`));
  longLivedEntries.push(checkpointEntry(2 * iteration, 2 * iteration - 1, { i: iteration }));
}
// Crash mid-iteration: one journaled tool call after the last committed checkpoint.
longLivedEntries.push(entry(2 * LONG_LIVED_ITERATIONS + 1, "tool", "in-flight"));

const FIXTURES: readonly ConformanceFixture[] = [
  {
    id: "no-checkpoint",
    runId: "conformance:no-checkpoint",
    entries: [
      entry(1, "tool", "a"),
      entry(2, "tool", "b"),
      entry(3, "thread.turn", undefined, {
        phase: "sent",
        correlationId: "conformance:no-checkpoint:3",
      }),
      entry(4, "tool", "d"),
      entry(5, "thread.create", undefined, {
        phase: "sent",
        correlationId: "conformance:no-checkpoint:5",
      }),
    ],
    resolved: [],
    boundarySeq: undefined,
    expectedSuffixSeqs: [1, 2, 3, 4, 5],
    expectedUnresolved: [],
  },
  {
    id: "bounded-suffix",
    runId: "conformance:bounded",
    entries: [
      entry(1, "tool", "a"),
      checkpointEntry(2, 1, { i: 1 }),
      // One-way verb in the prefix: never settles by design, must NOT be flagged.
      entry(3, "thread.create", undefined, {
        phase: "sent",
        correlationId: "conformance:bounded:3",
      }),
      entry(4, "thread.turn", undefined, {
        phase: "sent",
        correlationId: "conformance:bounded:4",
      }),
      corruptCheckpointEntry(5),
      entry(6, "user.input", undefined, {
        phase: "sent",
        correlationId: "conformance:bounded:6",
      }),
      checkpointEntry(7, 6, { i: 2 }),
      entry(8, "tool", "c"),
      entry(9, "tool", "d"),
    ],
    resolved: [
      reply("conformance:bounded:4", "thread.turn", "settled"),
      reply("conformance:bounded:6", "user.input", { ok: true }),
    ],
    boundarySeq: 7,
    expectedSuffixSeqs: [8, 9],
    expectedState: { i: 2 },
    expectedUnresolved: [],
    engine: "resume",
  },
  {
    id: "unsafe-window",
    runId: "conformance:unsafe",
    entries: [
      entry(1, "thread.turn", undefined, {
        phase: "sent",
        correlationId: "conformance:unsafe:1",
      }),
      entry(2, "tool", "b"),
      checkpointEntry(3, 2, { i: 1 }),
      entry(4, "tool", "c"),
    ],
    resolved: [],
    boundarySeq: 3,
    expectedSuffixSeqs: [4],
    expectedUnresolved: ["conformance:unsafe:1"],
    engine: "unsafe",
  },
  {
    id: "long-lived",
    runId: "conformance:long-lived",
    entries: longLivedEntries,
    resolved: [],
    boundarySeq: 2 * LONG_LIVED_ITERATIONS,
    expectedSuffixSeqs: [2 * LONG_LIVED_ITERATIONS + 1],
    expectedUnresolved: [],
  },
];

/** Throw a named conformance failure; the message carries the fixture and the failed check. */
function check(condition: boolean, runId: string, what: string, detail: string): void {
  if (condition) return;
  throw new Error(`[replay-window conformance] ${runId} — ${what}: ${detail}`);
}

/** Canonical JSON over a window's serializable content — the reference-parity and determinism
 * comparisons. `Map` iteration order is insertion order, so the suffix is sorted explicitly. */
function windowSnapshot(window: ReplayWindow): string {
  const suffix = [...window.entries.bySeq.values()]
    .map((e) => ({
      seq: e.seq,
      kind: e.kind,
      refId: e.refId,
      result: e.result === undefined ? null : e.result,
      phase: e.phase ?? null,
      correlationId: e.correlationId ?? null,
    }))
    .sort((a, b) => a.seq - b.seq);
  return JSON.stringify({
    checkpoint: window.checkpoint === undefined ? null : window.checkpoint,
    suffix,
    correlationIds: [...window.entries.byCorrelation.keys()].sort(),
    totalEntries: window.totalEntries,
    materializedEntries: window.materializedEntries,
    unresolvedPrefixCorrelationIds: [...window.unresolvedPrefixCorrelationIds].sort(),
  });
}

/** Idempotently reset a fixture run, then seed every entry in journal order. */
async function seedRun(store: JournalStore, fixture: ConformanceFixture): Promise<void> {
  await store.clear(fixture.runId);
  for (const e of fixture.entries) await store.appendEntry(fixture.runId, e);
  for (const r of fixture.resolved) await store.appendResolved(fixture.runId, r);
}

/**
 * A — the store-level window contract on one fixture: reference parity with
 * `selectReplayWindow`, the expected boundary/suffix/totals, bounded materialization,
 * complete correlation evidence, and deterministic repeat reads.
 */
async function checkWindowSemantics(
  store: JournalStore,
  fixture: ConformanceFixture,
  readWindow: (runId: string) => Promise<ReplayWindow>,
  pass: (runId: string, label: string) => void,
): Promise<void> {
  const { runId } = fixture;
  const reference = selectReplayWindow(await store.readEntries(runId));
  const window = await readWindow(runId);

  check(
    windowSnapshot(window) === windowSnapshot(reference),
    runId,
    "reference parity",
    `readReplayWindow diverged from the shared selectReplayWindow reference — store: ${windowSnapshot(
      window,
    )} / reference: ${windowSnapshot(reference)}`,
  );
  pass(runId, "window matches the shared reference selection");

  check(
    reference.checkpoint?.seq === fixture.boundarySeq &&
      JSON.stringify([...reference.entries.bySeq.keys()].sort((a, b) => a - b)) ===
        JSON.stringify(fixture.expectedSuffixSeqs) &&
      reference.totalEntries === fixture.entries.length,
    runId,
    "fixture ground truth",
    `the store's own rows do not reproduce the seeded fixture (boundary ${reference.checkpoint?.seq}, ` +
      `suffix ${[...reference.entries.bySeq.keys()].sort((a, b) => a - b).join(",")}, ` +
      `total ${reference.totalEntries} of ${fixture.entries.length})`,
  );
  pass(runId, "store rows reproduce the seeded fixture (boundary, suffix, totals)");

  if (fixture.boundarySeq === undefined) {
    check(
      window.checkpoint === undefined &&
        window.materializedEntries === window.totalEntries &&
        window.totalEntries === fixture.entries.length,
      runId,
      "no retroactive magic",
      `a pre-checkpoint run must stay a full-replay run (got checkpoint=${String(window.checkpoint)}, ` +
        `materialized ${window.materializedEntries} / total ${window.totalEntries})`,
    );
    pass(runId, "no-checkpoint run stays full-replay (no retroactive magic)");
  } else {
    check(
      window.checkpoint !== undefined && window.materializedEntries < window.totalEntries,
      runId,
      "bounded suffix",
      `a checkpointed run must materialize its suffix, not the lifetime journal ` +
        `(materialized ${window.materializedEntries} / total ${window.totalEntries})`,
    );
    for (const seq of window.entries.bySeq.keys()) {
      check(
        seq > fixture.boundarySeq,
        runId,
        "bounded suffix",
        `seq ${seq} is at or before the active boundary ${fixture.boundarySeq}`,
      );
    }
    pass(runId, "bounded suffix (no prefix entry materialized)");
  }

  check(
    JSON.stringify([...window.entries.byCorrelation.keys()].sort()) ===
      JSON.stringify(fixture.resolved.map((r) => r.correlationId).sort()),
    runId,
    "correlation evidence",
    `byCorrelation lost or gained replies: ${[...window.entries.byCorrelation.keys()].join(",")}`,
  );
  check(
    JSON.stringify([...window.unresolvedPrefixCorrelationIds].sort()) ===
      JSON.stringify([...fixture.expectedUnresolved].sort()),
    runId,
    "correlation evidence",
    `unresolved prefix flagged as ${[...window.unresolvedPrefixCorrelationIds].join(",")} — ` +
      `expected ${[...fixture.expectedUnresolved].join(",")}`,
  );
  pass(runId, "correlation map complete; only the resolvable prefix asks are flagged");

  const again = await readWindow(runId);
  check(
    windowSnapshot(again) === windowSnapshot(window),
    runId,
    "deterministic rehydration",
    `repeat reads of the same store state disagree: ${windowSnapshot(window)} vs ${windowSnapshot(again)}`,
  );
  pass(runId, "deterministic rehydration (repeat reads agree)");
}

/** The B-resume body: records the window the engine handed it, then journals one tail entry at
 * the next original seq (proving the counter continued past the boundary, not from zero). */
async function tailAppendingBody(
  request: ExecuteBodyRequest<WorkflowReference, unknown>,
): Promise<ResumeObservation> {
  const suffixSeqs = [...request.journal.bySeq.keys()].sort((a, b) => a - b);
  const nextSeq = suffixSeqs.length > 0 ? Math.max(...suffixSeqs) : (request.resume?.fromSeq ?? 0);
  request.sink.append(entry(nextSeq + 1, "tool", "conformance-tail"));
  return {
    suffixSeqs,
    fromSeq: request.resume?.fromSeq,
    state: request.resume?.checkpoint.state,
  };
}

/** A read-only B-resume body: observes the window without journaling anything. */
async function observationOnlyBody(
  request: ExecuteBodyRequest<WorkflowReference, unknown>,
): Promise<ResumeObservation> {
  return {
    suffixSeqs: [...request.journal.bySeq.keys()].sort((a, b) => a - b),
    fromSeq: request.resume?.fromSeq,
    state: request.resume?.checkpoint.state,
  };
}

const runFor = (
  store: JournalStore,
  runId: string,
  body: (request: ExecuteBodyRequest<WorkflowReference, unknown>) => Promise<unknown>,
) =>
  executeWorkflowRun({
    runId,
    ref: { path: "conformance.workflow.ts" },
    args: {},
    runsRoot: "/tmp",
    store,
    options: {},
    body,
  });

/**
 * B — the engine-level resume contract on a safe fixture: the engine replays only the bounded
 * suffix, seeds the boundary, restores the compact state, keeps the post-resume journal bounded,
 * and rehydrates deterministically.
 */
async function checkEngineResume(
  store: JournalStore,
  fixture: ConformanceFixture,
  readWindow: (runId: string) => Promise<ReplayWindow>,
  pass: (runId: string, label: string) => void,
): Promise<void> {
  const { runId } = fixture;
  check(
    fixture.boundarySeq !== undefined,
    runId,
    "safe fixture",
    "the resume fixture needs a boundary",
  );
  const boundarySeq = fixture.boundarySeq;

  const first = await runFor(store, runId, tailAppendingBody);
  check(
    first.kind === "completed",
    runId,
    "bounded resume",
    `the resume must complete (got ${first.kind})`,
  );
  if (first.kind !== "completed") throw new Error(`unreachable: resume outcome is ${first.kind}`);
  const out = first.output as ResumeObservation;
  check(
    JSON.stringify(out.suffixSeqs) === JSON.stringify(fixture.expectedSuffixSeqs),
    runId,
    "no full replay",
    `the engine handed the body the lifetime journal (${out.suffixSeqs.join(",")}) instead of the ` +
      `bounded suffix (${fixture.expectedSuffixSeqs.join(",")})`,
  );
  check(
    out.fromSeq === boundarySeq,
    runId,
    "boundary seed",
    `the seq counter must be seeded at the boundary ${boundarySeq} (got ${String(out.fromSeq)})`,
  );
  check(
    JSON.stringify(out.state) === JSON.stringify(fixture.expectedState),
    runId,
    "compact state",
    `the restored compact state is ${JSON.stringify(out.state)} — expected ${JSON.stringify(
      fixture.expectedState,
    )}`,
  );
  pass(runId, "engine replays only the bounded suffix (no full replay) and seeds the boundary");

  const tailSeq = Math.max(...fixture.expectedSuffixSeqs) + 1;
  const after = await readWindow(runId);
  const expectedAfterSeqs = [...fixture.expectedSuffixSeqs, tailSeq].sort((a, b) => a - b);
  check(
    after.checkpoint?.seq === boundarySeq &&
      JSON.stringify([...after.entries.bySeq.keys()].sort((a, b) => a - b)) ===
        JSON.stringify(expectedAfterSeqs),
    runId,
    "bounded resume",
    `the post-resume window drifted (boundary ${after.checkpoint?.seq}, ` +
      `materialized ${[...after.entries.bySeq.keys()].sort((a, b) => a - b).join(",")}) — expected the ` +
      `suffix plus the new tail ${expectedAfterSeqs.join(",")}`,
  );
  pass(runId, "post-resume journal stays bounded (the tail lands at its original position)");

  const firstObservation = await runFor(store, runId, observationOnlyBody);
  const secondObservation = await runFor(store, runId, observationOnlyBody);
  const firstObservationOutput =
    firstObservation.kind === "completed"
      ? JSON.stringify(firstObservation.output)
      : `<${firstObservation.kind}>`;
  const secondObservationOutput =
    secondObservation.kind === "completed"
      ? JSON.stringify(secondObservation.output)
      : `<${secondObservation.kind}>`;
  check(
    firstObservation.kind === "completed" &&
      secondObservation.kind === "completed" &&
      firstObservationOutput === secondObservationOutput,
    runId,
    "deterministic rehydration",
    `two identical resumes observed different windows: ${firstObservationOutput} vs ${secondObservationOutput}`,
  );
  pass(runId, "deterministic rehydration (identical resume outcomes)");
}

/**
 * B — the error shape when the store cannot honor its own window: a checkpoint that collapsed an
 * unsettled resolvable ask. The engine must refuse the resume with a `WorkflowError` BEFORE the
 * body runs, without journaling anything.
 */
async function checkUnsafeResume(
  store: JournalStore,
  fixture: ConformanceFixture,
  pass: (runId: string, label: string) => void,
): Promise<void> {
  const { runId } = fixture;
  const totalBefore = (await store.readEntries(runId)).bySeq.size;
  let bodyRan = false;
  let engineError: unknown;
  try {
    await runFor(store, runId, async () => {
      bodyRan = true;
      return "must not run";
    });
  } catch (error) {
    engineError = error;
  }
  check(
    engineError instanceof WorkflowError,
    runId,
    "unsafe window refusal",
    `resuming into a window with an unsettled prefix ask must throw WorkflowError ` +
      `(got ${engineError === undefined ? "a completed run" : String(engineError)})`,
  );
  const message = engineError instanceof Error ? engineError.message : String(engineError);
  check(
    message.includes("cannot resume from checkpoint"),
    runId,
    "error shape",
    `the refusal must name the reason: ${message}`,
  );
  for (const correlationId of fixture.expectedUnresolved) {
    check(
      message.includes(correlationId),
      runId,
      "error shape",
      `the refusal must name the unsettled correlation '${correlationId}': ${message}`,
    );
  }
  check(
    bodyRan === false,
    runId,
    "unsafe window refusal",
    "the body must not run once the window is refused",
  );
  const totalAfter = (await store.readEntries(runId)).bySeq.size;
  check(
    totalAfter === totalBefore,
    runId,
    "unsafe window refusal",
    `a refused resume must not journal new entries (${totalBefore} -> ${totalAfter})`,
  );
  pass(
    runId,
    "store cannot honor the window: the engine fails loud (WorkflowError) before the body runs",
  );
}

/**
 * Run the replay-window conformance suite against a host's `JournalStore` implementation.
 *
 * Seeds the deterministic fixtures through the store's own `appendEntry` / `appendResolved`
 * (so a store that loses or mangles rows fails its own ground-truth check), then asserts the
 * A window semantics and B engine resume behavior per fixture. Cleans the fixture runs up on
 * the way out. Throws on the first violated check; returns the passing report otherwise.
 */
export async function runReplayWindowConformance(
  store: JournalStore,
): Promise<ReplayWindowConformanceReport> {
  const readWindow = store.readReplayWindow;
  if (typeof readWindow !== "function") {
    throw new Error(
      `[replay-window conformance] store — window-aware store: the store does not implement ` +
        `readReplayWindow (${store.locator("replay-window-conformance")}); it stays a full-replay ` +
        `store and cannot honor the bounded-replay contract.`,
    );
  }
  const passed: string[] = [];
  const pass = (runId: string, label: string): void => {
    passed.push(`${runId}: ${label}`);
  };
  try {
    for (const fixture of FIXTURES) {
      await seedRun(store, fixture);
      await checkWindowSemantics(store, fixture, readWindow.bind(store), pass);
      if (fixture.engine === "resume") {
        await checkEngineResume(store, fixture, readWindow.bind(store), pass);
      }
      if (fixture.engine === "unsafe") {
        await checkUnsafeResume(store, fixture, pass);
      }
    }
  } finally {
    // Best-effort: leave the store as we found it (the fixtures are the suite's own runs).
    for (const fixture of FIXTURES) {
      try {
        await store.clear(fixture.runId);
      } catch {
        // cleanup is hygiene, not a conformance check
      }
    }
  }
  return { store: store.locator("replay-window-conformance"), passed };
}
