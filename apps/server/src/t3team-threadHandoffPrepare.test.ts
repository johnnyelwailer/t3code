import { assert, describe, it } from "@effect/vitest";
import { ProjectId, RunId, ScheduledTaskError, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import {
  ThreadManagementProjectionLoadError,
  ThreadManagementService,
} from "./orchestration-v2/ThreadManagementService.ts";
import { prepareThreadHandoff } from "./t3team-threadHandoff.ts";
import type { VcsProcess } from "./vcs/VcsProcess.ts";

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
  readonly vcs?: VcsProcess["Service"];
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
    {
      ...(input.scheduledTasks === undefined ? {} : { scheduledTasks: input.scheduledTasks }),
      ...(input.vcs === undefined ? {} : { vcs: input.vcs }),
    },
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

  /** A git checkout of `/repo` on `feature/x`, pushed and clean; `origin` as given. */
  const gitAt = (origin: string | null) =>
    ({
      run: (input: { readonly args: ReadonlyArray<string> }) => {
        const command = input.args.find((arg) => !arg.startsWith("--"));
        const out = (exitCode: number, stdout = "") => Effect.succeed({ exitCode, stdout });
        if (command === "remote") return origin === null ? out(2) : out(0, `${origin}\n`);
        if (command === "rev-parse") return out(0, "abc123\n");
        if (command === "rev-list") return out(0, "0\n");
        return out(0);
      },
    }) as unknown as VcsProcess["Service"];

  it.effect("refuses a checkout without an origin remote: the other machine can't get it", () =>
    Effect.gen(function* () {
      const { effect } = prepare({ shells: [null], waitForTurnEnd: false, vcs: gitAt(null) });
      const capture = yield* effect;
      assert.deepStrictEqual(
        capture.refusals.map((refusal) => refusal.reason),
        ["no_git_remote"],
      );
    }),
  );

  it.effect("lets a pushed, clean checkout with an origin remote move", () =>
    Effect.gen(function* () {
      const { effect } = prepare({
        shells: [null],
        waitForTurnEnd: false,
        vcs: gitAt("git@github.com:o/r.git"),
      });
      const capture = yield* effect;
      assert.deepStrictEqual(capture.refusals, []);
      assert.strictEqual(capture.branchState.upstream, "origin/feature/x");
    }),
  );
});
