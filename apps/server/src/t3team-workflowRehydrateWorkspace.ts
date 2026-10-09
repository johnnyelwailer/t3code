/**
 * A restored run's `ctx.workspace`: the same checkout-rooted file access a fresh launch hands it.
 *
 * The run row does not persist a root (a project can move, a thread's worktree can be re-created),
 * so boot rehydration re-derives it the way the launch did: the LAUNCH thread's worktree when it
 * has one, else the project's workspace root (`threadCheckoutRoot`). Both reads are batched for
 * every restored run at once — one project query and one thread-shell snapshot, never per run.
 * A run whose project is gone, or a runtime without the project store or filesystem services
 * (tests), is rebuilt without a workspace so the SDK's clear "started without a workspace
 * filesystem" error stays in place. A launch thread that is gone falls back to the project root.
 * Services are taken optionally from the environment so the rehydration effect's requirements are
 * unchanged.
 */
import type { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { threadCheckoutRoot } from "./t3team-threadCheckoutRoot.ts";
import { workspaceLaunchFields } from "./t3team-workspaceFileAccess.ts";

type RestoredRun = {
  readonly projectId: ProjectId;
  readonly launchThreadId: string | null;
};

export type RehydratedRunWorkspace = (run: RestoredRun) => ReturnType<typeof workspaceLaunchFields>;

const NO_WORKSPACE: RehydratedRunWorkspace = () => ({});

const warn = (what: string) => (error: unknown) =>
  Effect.logWarning(what, { error: error instanceof Error ? error.message : String(error) });

export const makeRehydratedRunWorkspace = Effect.fn("makeRehydratedRunWorkspace")(function* (
  runs: ReadonlyArray<RestoredRun>,
) {
  const projects = Option.getOrUndefined(yield* Effect.serviceOption(ProjectStoreV2));
  const threads = Option.getOrUndefined(yield* Effect.serviceOption(ThreadManagementService));
  const fileSystem = Option.getOrUndefined(yield* Effect.serviceOption(FileSystem.FileSystem));
  const pathService = Option.getOrUndefined(yield* Effect.serviceOption(Path.Path));
  if (projects === undefined || fileSystem === undefined || pathService === undefined) {
    return NO_WORKSPACE;
  }
  const projectRows = yield* projects
    .list({ projectIds: [...new Set(runs.map((run) => run.projectId))] })
    .pipe(
      Effect.catch((error) =>
        warn("failed to read project workspace roots for rehydrated runs")(error).pipe(
          Effect.as([]),
        ),
      ),
    );
  const projectRoots = new Map(projectRows.map((row) => [row.projectId, row.workspaceRoot]));

  // Active threads first; archived ones only when a launch thread is not among them.
  const worktrees = new Map<string, string | null>();
  if (threads !== undefined) {
    const wanted = new Set(
      runs.flatMap((run) => (run.launchThreadId === null ? [] : [run.launchThreadId])),
    );
    for (const location of ["active", "archive"] as const) {
      if (wanted.size === 0) break;
      const snapshot = yield* threads
        .getShellSnapshot({ location })
        .pipe(
          Effect.catch((error) =>
            warn("failed to read launch threads for rehydrated runs")(error).pipe(
              Effect.as(undefined),
            ),
          ),
        );
      for (const thread of snapshot?.threads ?? []) {
        if (!wanted.delete(thread.id)) continue;
        worktrees.set(thread.id, thread.worktreePath);
      }
    }
  }

  const workspace: RehydratedRunWorkspace = (run) => {
    const projectRoot = projectRoots.get(run.projectId);
    if (projectRoot === undefined) return {};
    const worktreePath = run.launchThreadId === null ? null : worktrees.get(run.launchThreadId);
    return workspaceLaunchFields({
      fileSystem,
      pathService,
      workspaceRoot: threadCheckoutRoot({ worktreePath }, projectRoot),
    });
  };
  return workspace;
});
