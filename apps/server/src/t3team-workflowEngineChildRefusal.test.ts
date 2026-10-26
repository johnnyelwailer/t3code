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
 *   6. a CAUGHT refusal does not poison the workflow: the next agent in the same run starts.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { startWorkflow, type WorkflowRef } from "@t3team/sdk";
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
});
