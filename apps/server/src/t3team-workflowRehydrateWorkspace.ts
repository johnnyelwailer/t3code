/**
 * A restored run's `ctx.workspace`: the same project-rooted file access a fresh launch hands it.
 *
 * The run row does not persist a workspace root (the root is the PROJECT's, and a project can move),
 * so boot rehydration reads it from the project read model by the row's `project_id`, exactly the
 * record a fresh recipe launch read it from. A run whose project is gone, or a runtime without the
 * project store or filesystem services (tests), is rebuilt without a workspace — the SDK's clear
 * "started without a workspace filesystem" error then stays in place. Services are taken
 * optionally from the environment so the rehydration effect's requirements are unchanged.
 */
import type { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { workspaceLaunchFields } from "./t3team-workspaceFileAccess.ts";

export type RehydratedRunWorkspace = (run: {
  readonly projectId: ProjectId;
}) => ReturnType<typeof workspaceLaunchFields>;

const NO_WORKSPACE: RehydratedRunWorkspace = () => ({});

export const makeRehydratedRunWorkspace = Effect.fn("makeRehydratedRunWorkspace")(function* (
  runs: ReadonlyArray<{ readonly projectId: ProjectId }>,
) {
  const projects = Option.getOrUndefined(yield* Effect.serviceOption(ProjectStoreV2));
  const fileSystem = Option.getOrUndefined(yield* Effect.serviceOption(FileSystem.FileSystem));
  const pathService = Option.getOrUndefined(yield* Effect.serviceOption(Path.Path));
  if (projects === undefined || fileSystem === undefined || pathService === undefined) {
    return NO_WORKSPACE;
  }
  const rows = yield* projects
    .list({ projectIds: [...new Set(runs.map((run) => run.projectId))] })
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("failed to read project workspace roots for rehydrated runs", {
          error: error instanceof Error ? error.message : String(error),
        }).pipe(Effect.as([])),
      ),
    );
  const roots = new Map(rows.map((row) => [row.projectId, row.workspaceRoot] as const));
  const workspace: RehydratedRunWorkspace = (run) =>
    workspaceLaunchFields({ fileSystem, pathService, workspaceRoot: roots.get(run.projectId) });
  return workspace;
});
