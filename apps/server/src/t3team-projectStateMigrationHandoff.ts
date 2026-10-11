/**
 * Hands a large state-dir migration to a new thread running the `migrate-project-state` recipe,
 * instead of copying inline in the main-repository request.
 *
 * {@link beginStateMigrationHandoff} records the migration `pending` and returns at once; the
 * launch runs detached from the request (a client giving up cannot interrupt it): scaffold the
 * recipe into the receiving checkout if setup has not, resolve it through recipe discovery, launch
 * a thread on the project's (already switched) workspace and start the recipe's workflow there.
 * The record then reads `running`; the recipe's outcome script settles it.
 *
 * @module t3team-projectStateMigrationHandoff
 */
import {
  CommandId,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  type ProjectId,
  type ProjectStateMigration,
} from "@t3tools/contracts";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import {
  resolveProjectSettings,
  type LegacyProjectSettingsFields,
} from "@t3tools/shared/projectSettings";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { ThreadLaunchService } from "./orchestration-v2/ThreadLaunchService.ts";
import * as ServerSettings from "./serverSettings.ts";
import { getConfiguredDefaultModelSelection } from "./t3team-configuredDefaultModelSelection.ts";
import { migrationExcludes } from "./t3team-projectMainRepositoryState.ts";
import {
  ensureStateMigrationRecipe,
  STATE_MIGRATION_RECIPE_ID,
} from "./t3team-projectSetupStateMigrationRecipe.ts";
import {
  isTerminalStateMigration,
  readStateMigrationRecord,
  STATE_MIGRATION_RECORD_RELATIVE_PATH,
  updateStateMigrationRecord,
  writeStateMigrationRecord,
} from "./t3team-projectStateMigrationRecord.ts";
import { settleStateMigration } from "./t3team-projectStateMigrationStatus.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { resolveRecipeActionById } from "./t3team-recipeRunById.ts";
import { launchRecipeWorkflow } from "./t3team-recipeWorkflowLaunch.ts";

export type StateMigrationProject = LegacyProjectSettingsFields & { readonly id: ProjectId };

const causeMessage = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : String(error);
};

const launchMigrationThread = Effect.fn("launchMigrationThread")(function* (input: {
  readonly project: StateMigrationProject;
  readonly record: ProjectStateMigration;
}) {
  const { project, record } = input;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* ensureStateMigrationRecipe(record.toRoot);
  const recipe = yield* resolveRecipeActionById({
    workspaceRoot: record.toRoot,
    recipeId: STATE_MIGRATION_RECIPE_ID,
  });
  const settings = yield* (yield* ServerSettings.ServerSettingsService).getSettings;
  const resolved = resolveProjectSettings(settings, project.id, project).settings;
  const modelSelection =
    resolved.defaultModelSelection ?? getConfiguredDefaultModelSelection(DEFAULT_MODEL);
  const modes = {
    runtimeMode: resolved.defaultRuntimeMode,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
  };
  const { threadId } = yield* (yield* ThreadLaunchService).launch({
    commandId: CommandId.make(`server:t3team:state-migration:${record.migrationId}`),
    projectId: project.id,
    title: "Migrate project state",
    modelSelection,
    ...modes,
    workspaceStrategy: { type: "root" },
    createdBy: "system",
    creationSource: "server",
  });
  const run = yield* launchRecipeWorkflow({
    threadId,
    recipePath: recipe.recipePath,
    workflowPath: recipe.workflowPath,
    args: {
      migrationId: record.migrationId,
      fromRoot: record.fromRoot,
      toRoot: record.toRoot,
      stateDir: record.stateDir,
      excludes: record.excludes,
      recordPath: STATE_MIGRATION_RECORD_RELATIVE_PATH,
      isGitCheckout: yield* fileSystem
        .exists(path.join(record.toRoot, ".git"))
        .pipe(Effect.orElseSucceed(() => false)),
      missingFilesAtLeast: record.missingFilesAtLeast ?? 0,
    },
    modelSelection,
    ...modes,
    recipe: { id: recipe.id, version: recipe.version, action: recipe.action },
  });
  yield* updateStateMigrationRecord(record.toRoot, record.migrationId, {
    status: "running",
    threadId,
    ...(run.runId === undefined ? {} : { runId: run.runId }),
  });
});

/**
 * Records a `pending` migration into `toRoot`. A live migration already recorded there is returned
 * with `reused`: one migration per checkout at a time.
 */
export const recordPendingStateMigration = Effect.fn("recordPendingStateMigration")(
  function* (input: {
    readonly fromRoot: string;
    readonly toRoot: string;
    readonly missingFilesAtLeast: number;
  }) {
    const now = yield* DateTime.now;
    const existing = yield* readStateMigrationRecord(input.toRoot);
    if (
      existing !== undefined &&
      !isTerminalStateMigration(existing) &&
      settleStateMigration({
        record: existing,
        run: undefined,
        nowMs: DateTime.toEpochMillis(now),
      }) === undefined
    ) {
      return { record: existing, reused: true };
    }
    const record: ProjectStateMigration = {
      migrationId: t3teamRandomUUID(),
      status: "pending",
      fromRoot: input.fromRoot,
      toRoot: input.toRoot,
      stateDir: PROJECT_STATE_DIR,
      excludes: migrationExcludes(),
      missingFilesAtLeast: input.missingFilesAtLeast,
      startedAt: DateTime.formatIso(now),
      updatedAt: DateTime.formatIso(now),
    };
    yield* writeStateMigrationRecord(record);
    return { record, reused: false };
  },
);

/** Runs `launch`; when it fails, the record says so instead of staying `pending`. */
export const settleFailedStateMigrationLaunch = <E, R>(
  record: ProjectStateMigration,
  launch: Effect.Effect<void, E, R>,
) =>
  launch.pipe(
    Effect.catchCause((cause) =>
      Effect.logError("State migration thread failed to launch.", { cause }).pipe(
        Effect.andThen(
          updateStateMigrationRecord(record.toRoot, record.migrationId, {
            status: "failed",
            error: `The migration thread could not be launched: ${causeMessage(cause)}`,
          }),
        ),
        Effect.ignore,
      ),
    ),
  );

/** Records the migration and starts its thread in the background; returns the record at once. */
export const beginStateMigrationHandoff = Effect.fn("beginStateMigrationHandoff")(
  function* (input: {
    readonly project: StateMigrationProject;
    readonly fromRoot: string;
    readonly toRoot: string;
    readonly missingFilesAtLeast: number;
  }) {
    const { record, reused } = yield* recordPendingStateMigration(input);
    if (reused) return record;
    yield* settleFailedStateMigrationLaunch(
      record,
      launchMigrationThread({ project: input.project, record }),
    ).pipe(Effect.forkDetach({ startImmediately: true }));
    return record;
  },
);
