import { assert, describe, it } from "@effect/vitest";
import { ProjectId, RunId, ScheduledTaskError, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import {
  ThreadManagementProjectionLoadError,
  ThreadManagementService,
} from "./orchestration-v2/ThreadManagementService.ts";
import { prepareThreadHandoff } from "./t3team-threadHandoff.ts";

const THREAD = ThreadId.make("thread:source");
const RUN = RunId.make("run:long");

const shellWith = (activeRunId: RunId | null) =>
  ({
    id: THREAD,
    projectId: ProjectId.make("project-x"),
    title: "Long turn",
    branch: "feature/x",
    worktreePath: "/repo",
    activeRunId,
    pendingRuntimeRequest: null,
  }) as never;

/** `shells` are what successive `getThreadShell` reads return; the last one repeats. */
const prepare = (input: {
  readonly shells: ReadonlyArray<RunId | null>;
  readonly waitForTurnEnd: boolean;
  readonly snapshotFails?: boolean;
  readonly scheduledTasks?: Effect.Effect<ReadonlyArray<never>, ScheduledTaskError>;
}) => {
  const calls: string[] = [];
  let reads = 0;
  const threads = {
    getThreadShell: () =>
      Effect.sync(() => {
        const runId = input.shells[Math.min(reads++, input.shells.length - 1)] ?? null;
        return shellWith(runId);
      }),
    waitForThread: () =>
      Effect.sync(() => {
        calls.push("wait");
        return { threadId: THREAD, run: null, timedOut: true };
      }),
    getThreadRecords: () =>
      Effect.sync(() => {
        calls.push("records");
        return { runs: [], turnItems: [] };
      }),
    getShellSnapshot: () =>
      input.snapshotFails === true
        ? Effect.fail(
            new ThreadManagementProjectionLoadError({
              projectId: ProjectId.make("project-x"),
              threadId: THREAD,
              cause: "unreadable",
            }),
          )
        : Effect.succeed({ threads: [] }),
  } as unknown as ThreadManagementService["Service"];
  const projects = {
    get: () => Effect.succeedNone,
  } as unknown as ProjectStore.ProjectStoreV2["Service"];
  const effect = prepareThreadHandoff(
    { threadId: THREAD, waitForTurnEnd: input.waitForTurnEnd },
    input.scheduledTasks === undefined ? {} : { scheduledTasks: input.scheduledTasks },
  ).pipe(
    Effect.provideService(ThreadManagementService, threads),
    Effect.provideService(ProjectStore.ProjectStoreV2, projects),
  );
  return { effect, calls };
};

describe("prepareThreadHandoff", () => {
  it.effect("refuses, without capturing, when the waited-for turn is still running", () =>
    Effect.gen(function* () {
      const { effect, calls } = prepare({ shells: [RUN, RUN], waitForTurnEnd: true });
      const error = yield* Effect.flip(effect);
      assert.strictEqual(error.message, "The turn is still running, so the thread was not moved.");
      assert.deepStrictEqual(calls, ["wait"]);
    }),
  );

  it.effect("captures with no active run once the waited-for turn ended", () =>
    Effect.gen(function* () {
      const { effect, calls } = prepare({ shells: [RUN, null], waitForTurnEnd: true });
      const capture = yield* effect;
      assert.strictEqual(capture.activeRunId, null);
      assert.deepStrictEqual(calls, ["wait", "records"]);
    }),
  );

  it.effect("refuses every check it could not read instead of counting it clean", () =>
    Effect.gen(function* () {
      const { effect } = prepare({
        shells: [null],
        waitForTurnEnd: false,
        snapshotFails: true,
        scheduledTasks: Effect.fail(new ScheduledTaskError({ message: "scheduler down" })),
      });
      const capture = yield* effect;
      // No VCS here: branch and tree state are unknown too.
      assert.deepStrictEqual(
        capture.refusals.map((refusal) => refusal.reason),
        ["unverified", "unverified", "unverified", "unverified"],
      );
    }),
  );
});
