/**
 * A `ThreadLaunchService` over the real orchestrator for workflow tests: it creates the thread
 * under the requested id, as the service does once the workspace is prepared, and records each
 * launch. A worktree strategy lands in a fixed fake worktree; no git runs.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  ThreadLaunchService,
  type ThreadLaunchInput,
} from "./orchestration-v2/ThreadLaunchService.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";

export const FAKE_LAUNCH_WORKTREE = "/worktrees/launched";

export function makeThreadLaunchFake() {
  const launches: Array<ThreadLaunchInput> = [];
  /** Set to make the next launch die right after its thread is created, as a crash would. */
  const crash = { afterCreate: false };
  const layer = Layer.effect(
    ThreadLaunchService,
    Effect.gen(function* () {
      const threads = yield* ThreadManagementService;
      const launch = (input: ThreadLaunchInput) =>
        Effect.gen(function* () {
          launches.push(input);
          const threadId = input.threadId!;
          const worktree = input.workspaceStrategy.type !== "root";
          yield* threads.dispatch({
            type: "thread.create",
            commandId: input.commandId,
            threadId,
            projectId: input.projectId,
            title: input.title,
            modelSelection: input.modelSelection,
            runtimeMode: input.runtimeMode,
            interactionMode: input.interactionMode,
            branch: worktree ? (input.workspaceStrategy.branch ?? null) : null,
            worktreePath: worktree ? FAKE_LAUNCH_WORKTREE : null,
            createdBy: input.createdBy,
            creationSource: input.creationSource,
          });
          if (crash.afterCreate) {
            crash.afterCreate = false;
            return yield* Effect.die("crashed after create");
          }
          return { threadId, resumed: false };
        }).pipe(Effect.orDie);
      return {
        launch,
        retryPreparation: () => Effect.die("unused"),
      } as unknown as ThreadLaunchService["Service"];
    }),
  );
  return { layer, launches, crash };
}
