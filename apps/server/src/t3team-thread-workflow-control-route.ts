import type { ControlProjectRecipeWorkflowRequest } from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { HttpRouter } from "effect/http";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { WorkflowJournalStore } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { nowIso } from "./t3team-thread-recipe-workflow-routes-resolve.ts";
import { makeWorkflowRouteThreadReads } from "./t3team-thread-recipe-workflow-routes-shared.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost } from "./t3team-workflowHost.ts";
import { controlWorkflowRun } from "./t3team-workflowRunControl.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { makeWorkflowTurnRedriveLive } from "./t3team-workflowTurnRedriveLive.ts";

// The control sequence itself lives in t3team-workflowRunControl.ts, shared with the agent's
// `t3team.orchestration.pause` / `.stop` tools (GHE #403); this route is the card's transport.
export { workflowControlValidationError } from "./t3team-workflowRunControl.ts";

export const t3teamThreadWorkflowControlRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/workflow/control",
  Effect.gen(function* () {
    const input = yield* readJsonBody<ControlProjectRecipeWorkflowRequest>();
    const threadId = input.threadId?.trim() ?? "";
    const runId = input.workflowRunId?.trim() ?? "";
    if (!threadId || !runId || !["pause", "resume", "stop"].includes(input.action)) {
      return yield* new T3TeamAtlassianError({
        message: "threadId, workflowRunId and action are required.",
      });
    }

    const repo = yield* WorkflowRunRepository;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const scheduler = yield* T3TeamWorkflowScheduler;
    const host = yield* T3TeamWorkflowHost;
    const threads = yield* ThreadManagementService;
    const reads = yield* makeWorkflowRouteThreadReads;
    const journalStore = yield* WorkflowJournalStore;
    const signalStore = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowSignalStore));
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const found = yield* repo.getById({ runId });
    if (Option.isNone(found)) {
      return yield* new T3TeamAtlassianError({
        message: "Workflow run not found for this thread.",
      });
    }
    const { status } = yield* controlWorkflowRun(
      {
        repo,
        registry,
        rearmScheduler: () => scheduler.rearm(),
        host,
        turnRedrive: makeWorkflowTurnRedriveLive({
          registry,
          threads,
          host,
          runRepository: repo,
        }),
        // GHE #332: a `watching` run's resume drains its bridged inbox events here.
        ...(signalStore === undefined ? {} : { signalStore }),
        // GHE #344: "Retry run" on a failed card re-drives the journal through this route too.
        retryFailed: {
          journalStore,
          fileSystem,
          path,
          loadThreadProject: reads.loadThreadProject,
        },
        nowIso,
        // This route only runs off an authenticated user's explicit click on the workflow run
        // card — it IS user intent, so a stop is stamped like the composer's Stop button.
        stopOrigin: "user",
      },
      found.value,
      { threadId, action: input.action },
    ).pipe(Effect.mapError((message) => new T3TeamAtlassianError({ message })));

    return okJson({ ok: true, status });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to control workflow.")),
    Effect.catch(errorResponse),
  ),
);
