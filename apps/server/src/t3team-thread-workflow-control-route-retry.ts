/**
 * The "resume a failed run" branch of the workflow control route, split out to keep
 * `t3team-thread-workflow-control-route.ts` under the additive size budget.
 *
 * Mirrors `t3team.orchestration.resume`'s failed-run branch exactly (same journal re-drive, same
 * rehydrated scripts) via {@link makeResumeFailedRun}, guarded by a journal-presence check: a run
 * with no journal has nothing to replay, so the detached re-drive would settle "failed" again
 * immediately, and the optimistic "running" the client flips to right after this call would never
 * reconcile back on its own (GHE #344). Fail the request instead of dispatching, so the card
 * never leaves "failed".
 */
import { ThreadId } from "@t3tools/contracts";
import type { JournalStore } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { loadThreadProjectContext } from "./t3team-thread-recipe-workflow-routes-shared.ts";
import { makeResumeFailedRun } from "./t3team-toolBrokerWorkflowResumeFailed.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { WorkflowScheduler } from "./t3team-workflowScheduler.ts";

export function resumeFailedWorkflowRunControlAction(
  deps: {
    readonly run: WorkflowRun;
    readonly threadId: string;
    readonly repo: WorkflowRunRepositoryShape;
    readonly registry: T3TeamWorkflowEngineRegistryShape;
    readonly scheduler: WorkflowScheduler;
    readonly orchestration: OrchestrationEngineShape;
    readonly journalStore: JournalStore;
    readonly fileSystem: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly projectionSnapshotQuery: ProjectionSnapshotQueryShape;
  },
  runId: string,
): Effect.Effect<"running", T3TeamAtlassianError> {
  const {
    run,
    threadId,
    repo,
    registry,
    scheduler,
    orchestration,
    journalStore,
    fileSystem,
    path,
    projectionSnapshotQuery,
  } = deps;
  return Effect.gen(function* () {
    const hasJournal = yield* Effect.promise(() => journalStore.hasRun(runId));
    if (!hasJournal) {
      return yield* new T3TeamAtlassianError({
        message: "This run has no journal to resume from — relaunch it instead.",
      });
    }
    const dispatch = (command: Parameters<typeof orchestration.dispatch>[0]): Promise<void> =>
      Effect.runPromise(orchestration.dispatch(command)).then(() => undefined);
    yield* makeResumeFailedRun(
      {
        fileSystem,
        path,
        runRepository: repo,
        registry,
        journalStore,
        rearmScheduler: () => scheduler.rearm(),
        dispatch,
        loadThreadProject: (id) =>
          loadThreadProjectContext(id).pipe(
            Effect.provideService(ProjectionSnapshotQuery, projectionSnapshotQuery),
          ),
      },
      ThreadId.make(threadId),
      t3teamRandomUUID,
    )(run).pipe(Effect.mapError((message) => new T3TeamAtlassianError({ message })));
    return "running" as const;
  });
}
