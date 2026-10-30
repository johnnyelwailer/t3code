// @effect-diagnostics nodeBuiltinImport:off - the test reads workflow fixtures and a temp journal root.
/**
 * A child the host REFUSES to create must fail the RUN — through the REAL durable SDK engine
 * (`startWorkflow`) and the REAL broker (`createWorkflowEngineBroker`), not only through the
 * `createThreadPrimitives` surface.
 *
 * The sibling test (`t3team-workflowEngineBrokerChildSpawn.test.ts`) proves the broker's own
 * contract in isolation: the one-way create settles quietly, nothing phantom is registered, and
 * the refusal is re-thrown on that child's next awaited turn. What it cannot prove is that the
 * refusal REACHES THE AUTHOR through the whole production path — the durable engine, the
 * journal, the loader's body — because a primitives-level harness stops short of the run.
 *
 * The contract asserted here:
 *   1. the run FAILS with the host's ORIGINAL error object (not a copy, not a wrapper);
 *   2. it fails PROMPTLY — the run rejects instead of parking on a turn that never began;
 *   3. nothing phantom survives: no child in the run's registry, no completed spawn step;
 *   4. no turn was started on the host — the child does not exist, so there is nothing to run;
 *   5. the refusal leaves no unhandled rejection behind (the create is fired floating);
 *   6. a CAUGHT refusal does not poison the workflow: the next agent in the same run starts;
 *   7. a CAUGHT refusal is NOT durable across an ORDINARY resume. The refused turn keeps a `sent`
 *      entry with no `resolved` partner, so replay can only read it as an ask still awaiting its
 *      reply, and the sticky suspension latch re-parks the run there, without consuming the
 *      surviving child's delivered answer;
 *   8. with the SAME broker, the supported one-shot `refire` target recovers that park: re-sending the
 *      refused turn makes the broker re-throw the host's ORIGINAL refusal, the body's `catch`
 *      handles it, the latch never arms, and the run completes on the surviving child's reply —
 *      while journaling no second intent line for the re-sent ask.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  appendResolvedEntry,
  buildJournalMaps,
  resumeWorkflow,
  startWorkflow,
  type JournalMaps,
  type WorkflowRef,
  type WorkflowRunOptions,
} from "@t3team/sdk";
import { afterAll, describe, expect, it } from "vite-plus/test";

import {
  CHILD_SPAWN_LAUNCH_THREAD_ID,
  flushRejections,
  makeChildSpawnHarness,
  makeRefusingWorkflowHost,
  MISSING_LAUNCH_CHECKOUT,
} from "./t3team-workflowEngineChildSpawn.fixtures.ts";

const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-child-refusal-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

/** The workflow fixtures, addressed the way the server's launch path addresses them. */
const fixtureRef = (name: string): WorkflowRef => ({
  kind: "workflow",
  path: `../__fixtures__/${name}`,
  absolutePath: NodeURL.fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)),
});

const propagateRef = fixtureRef("t3team-childRefusalPropagate.workflow.ts");
const caughtRef = fixtureRef("t3team-childRefusalCaught.workflow.ts");

/** The run's replay maps, read from the same `<runsRoot>/<runId>/journal.jsonl` the engine uses. */
function readRunJournal(runId: string): JournalMaps {
  const file = NodePath.join(runsRoot, runId, "journal.jsonl");
  const lines = NodeFS.existsSync(file)
    ? NodeFS.readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
    : [];
  return buildJournalMaps(lines.map((line) => JSON.parse(line) as unknown));
}

/**
 * The lowest-seq `thread.turn` whose reply never landed. For the caught fixture that is the REFUSED
 * child's awaited half: its create was refused, so the turn fired, threw, and left a `sent` line
 * with no `resolved` partner — the exact journal shape replay has to make sense of.
 */
function firstUnansweredTurn(journal: JournalMaps): string {
  const open = [...journal.bySeq.values()]
    .filter((entry) => entry.kind === "thread.turn" && entry.phase === "sent")
    .sort((left, right) => left.seq - right.seq)
    .find((entry) => !journal.byCorrelation.has(entry.correlationId ?? ""));
  if (open?.correlationId === undefined) {
    throw new Error("expected an unanswered thread.turn in the journal");
  }
  return open.correlationId;
}

/** Collect unhandled rejections for the duration of `run`. */
async function withoutUnhandledRejection<T>(
  run: () => Promise<T>,
): Promise<{ value: T; unhandled: unknown[] }> {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const value = await run();
    await flushRejections();
    return { value, unhandled };
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
}

describe("a child the host refuses, through the durable engine and the real broker", () => {
  it("fails the run with the host's original refusal and leaves no phantom child", async () => {
    const refusal = new Error(MISSING_LAUNCH_CHECKOUT);
    const { host, attempts, created, turns } = makeRefusingWorkflowHost(refusal);
    const runId = "run-refusal-propagate";
    const { broker, registry, spawnPips } = makeChildSpawnHarness(host, { runId });

    const { value, unhandled } = await withoutUnhandledRejection(async () =>
      startWorkflow(
        propagateRef,
        {},
        {
          runsRoot,
          tools: [],
          broker,
          launchThreadId: CHILD_SPAWN_LAUNCH_THREAD_ID,
          runId,
        },
      ).catch((error: unknown) => error),
    );

    // The ORIGINAL error object, not a copy and not a wrapper: the author's `catch` must be able
    // to recognise the host's own failure.
    expect(value).toBe(refusal);
    // The create reached the host once and was refused; nothing was created.
    expect(attempts).toHaveLength(1);
    expect(created).toEqual([]);
    // The refusal leaves no unhandled rejection behind: the create is fired floating.
    expect(unhandled).toEqual([]);
    // No turn was started on a child that does not exist.
    expect(turns).toEqual([]);
    // No phantom child: the registry and the completed spawn pip both claim existence.
    expect(registry.childThreadsForRun(runId)).toEqual([]);
    expect(spawnPips()).toEqual([]);
  });

  it("lets the body catch the refusal and still runs the next agent in the same workflow", async () => {
    const refusal = new Error(MISSING_LAUNCH_CHECKOUT);
    const { host, attempts, created, turns } = makeRefusingWorkflowHost(refusal);
    const runId = "run-refusal-caught";
    const { broker, registry, spawnPips } = makeChildSpawnHarness(host, { runId });
    const logs: string[] = [];

    const { value, unhandled } = await withoutUnhandledRejection(async () =>
      startWorkflow(
        caughtRef,
        {},
        {
          runsRoot,
          tools: [],
          broker,
          launchThreadId: CHILD_SPAWN_LAUNCH_THREAD_ID,
          runId,
          onLog: (message) => logs.push(message),
        },
      ),
    );

    // The run did not FAIL: the refusal was caught, so the workflow carried on and parked on the
    // SECOND child's turn — the ordinary place a live run waits for an answer.
    expect("suspended" in value).toBe(true);
    expect(unhandled).toEqual([]);
    // The body saw the host's own refusal message.
    expect(logs).toEqual([`child refused: ${MISSING_LAUNCH_CHECKOUT}`]);
    // Two create attempts: the refused first child, then the accepted second one.
    expect(attempts).toHaveLength(2);
    expect(created).toHaveLength(1);
    // Only the SECOND child got a turn, and it is the child that really exists.
    expect(turns.map((turn) => turn.threadId)).toEqual([created[0]?.threadId]);
    expect(registry.childThreadsForRun(runId)).toEqual([created[0]?.threadId]);
    // The completed spawn pip rides the create the host accepted, and only that one.
    expect(spawnPips().map((step) => step.threadId)).toEqual([created[0]?.threadId]);
  });

  it("re-parks on the already refused turn when the surviving child's reply lands", async () => {
    const refusal = new Error(MISSING_LAUNCH_CHECKOUT);
    const { host, attempts, created, turns } = makeRefusingWorkflowHost(refusal);
    const runId = "run-refusal-caught-resume";
    const { broker, registry } = makeChildSpawnHarness(host, { runId });
    const logs: string[] = [];
    const options: WorkflowRunOptions = {
      runsRoot,
      tools: [],
      broker,
      launchThreadId: CHILD_SPAWN_LAUNCH_THREAD_ID,
      onLog: (message) => logs.push(message),
    };
    const answer = "Ship behind a flag; roll back on the first error budget burn.";

    // The live run parks on the SURVIVING child's turn, exactly as the test above asserts.
    const parked = await startWorkflow(caughtRef, {}, { ...options, runId });
    expect("suspended" in parked).toBe(true);
    if (!("suspended" in parked)) throw new Error("expected the live run to park");
    const survivingTurn = parked.correlationId;
    // Two distinct asks are open: the refused child's turn (lower seq) and the surviving one.
    const refusedTurn = firstUnansweredTurn(readRunJournal(runId));
    expect(refusedTurn).not.toBe(survivingTurn);

    // Deliver the surviving child's answer through the SUPPORTED resume path — the same
    // `appendResolvedEntry` + `resumeWorkflow` pair the production reactor drives off turn-done.
    const wrote = await appendResolvedEntry({
      runsRoot,
      runId,
      correlationId: survivingTurn,
      reply: answer,
    });
    expect(wrote).toBe(true);

    // CHARACTERIZED LIMITATION: the answer is durable, but the run can never reach it. Replay walks
    // the body from the top; the refused turn is a recorded `sent` with no `resolved` partner, so
    // `awaitResolution` reads it as an ask still waiting and arms the sticky suspension latch
    // THERE. The latch is first-wins and re-throws at every engine touchpoint, so the body's
    // `catch` cannot carry the run past it — the run parks on a child the host refused to create.
    const resumed = await resumeWorkflow(runId, caughtRef, {}, options);
    expect("suspended" in resumed).toBe(true);
    if (!("suspended" in resumed)) throw new Error("expected the resumed run to park");
    expect(resumed.correlationId).toBe(refusedTurn);
    expect(resumed.correlationId).not.toBe(survivingTurn);

    // A second ordinary resume repeats the same park. The next test exercises the supported escape.
    const again = await resumeWorkflow(runId, caughtRef, {}, options);
    expect("suspended" in again).toBe(true);
    if (!("suspended" in again)) throw new Error("expected the second resume to park");
    expect(again.correlationId).toBe(refusedTurn);

    // The delivered reply is still journaled, and still unconsumed by the body.
    expect(readRunJournal(runId).byCorrelation.get(survivingTurn)?.reply).toBe(answer);

    // Replay re-fires nothing: the host saw exactly the live run's two creates and one turn, and no
    // phantom child appeared for the refused one.
    expect(attempts).toHaveLength(2);
    expect(created).toHaveLength(1);
    expect(turns.map((turn) => turn.threadId)).toEqual([created[0]?.threadId]);
    expect(registry.childThreadsForRun(runId)).toEqual([created[0]?.threadId]);

    // The caught REASON is not durable either: on replay the author's `catch` is handed the
    // engine's suspension signal instead of the host's refusal, once per resume. An author who
    // branches on the refusal text takes a different branch after any restart.
    expect(logs[0]).toBe(`child refused: ${MISSING_LAUNCH_CHECKOUT}`);
    expect(logs).toHaveLength(3);
    expect(logs[1]).toContain(
      `child refused: Workflow suspended awaiting reply for correlationId '${refusedTurn}'`,
    );
    expect(logs[2]).toBe(logs[1]);
  });

  it("completes with the same broker when the refused turn is an explicit refire target", async () => {
    const refusal = new Error(MISSING_LAUNCH_CHECKOUT);
    const { host, attempts, created, turns } = makeRefusingWorkflowHost(refusal);
    const runId = "run-refusal-caught-refire";
    const { broker, registry, spawnPips } = makeChildSpawnHarness(host, { runId });
    const logs: string[] = [];
    const options: WorkflowRunOptions = {
      runsRoot,
      tools: [],
      broker,
      launchThreadId: CHILD_SPAWN_LAUNCH_THREAD_ID,
      onLog: (message) => logs.push(message),
    };
    const answer = "Ship behind a flag; roll back on the first error budget burn.";

    const parked = await startWorkflow(caughtRef, {}, { ...options, runId });
    expect("suspended" in parked).toBe(true);
    if (!("suspended" in parked)) throw new Error("expected the live run to park");
    const survivingTurn = parked.correlationId;
    const refusedTurn = firstUnansweredTurn(readRunJournal(runId));
    // A stale pending ask for the REFUSED child is already on the registry before any resume.
    const pendingAfterLive = [...registry.pendingThreadIds()];
    expect(
      await appendResolvedEntry({ runsRoot, runId, correlationId: survivingTurn, reply: answer }),
    ).toBe(true);

    // SUPPORTED RECOVERY: naming the refused turn as the run's one-shot `refire` target re-sends it.
    // The broker's per-child refusal store is NOT consumed by a throw, so the re-send re-throws the
    // host's ORIGINAL refusal; the body's `catch` handles that instead of the engine's suspension
    // signal, the sticky latch never arms, and the replay carries on to the surviving child's
    // now-journaled reply. Where the ordinary resume above re-parks forever, this COMPLETES.
    const resumed = await resumeWorkflow(runId, caughtRef, {}, { ...options, refire: refusedTurn });
    expect("result" in resumed).toBe(true);
    if (!("result" in resumed)) throw new Error("expected the refire resume to complete");
    expect(resumed.result).toEqual({ refusal: MISSING_LAUNCH_CHECKOUT, answer });

    // The author's `catch` saw the host's own refusal again — the durable reason that an ordinary
    // resume replaces with the engine's suspension signal.
    expect(logs).toEqual([
      `child refused: ${MISSING_LAUNCH_CHECKOUT}`,
      `child refused: ${MISSING_LAUNCH_CHECKOUT}`,
    ]);

    // Pre-fire intent semantics survive the re-send: `refireRecorded` journals NOTHING, so the run
    // still has exactly its four original `sent` lines — no second intent line for the re-sent ask —
    // and the refused turn still has no `resolved` partner of its own.
    const journal = readRunJournal(runId);
    expect(journal.bySeq.size).toBe(4);
    expect(journal.byCorrelation.get(refusedTurn)).toBeUndefined();
    expect([...journal.byCorrelation.keys()]).toEqual([survivingTurn]);

    // The re-send reached the broker and stopped at the refusal: no create was retried, and no turn
    // was started on the child that does not exist.
    expect(attempts).toHaveLength(2);
    expect(created).toHaveLength(1);
    expect(turns.map((turn) => turn.threadId)).toEqual([created[0]?.threadId]);
    expect(registry.childThreadsForRun(runId)).toEqual([created[0]?.threadId]);
    expect(spawnPips().map((step) => step.threadId)).toEqual([created[0]?.threadId]);

    // This harness does not invoke the production controller's settlement cleanup. Its pending
    // entries remain after the engine returns; this does not establish their production lifetime.
    // A fresh broker also loses the cached refusal, so restart recovery needs separate coverage.
    expect(pendingAfterLive).toEqual([`${runId}:1`, `${runId}:3`]);
    expect(registry.pendingThreadIds()).toEqual(pendingAfterLive);
    expect(registry.peekPending(`${runId}:1`)?.correlationId).toBe(refusedTurn);
  });
});
