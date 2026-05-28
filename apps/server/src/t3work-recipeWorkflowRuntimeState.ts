import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { ThreadId } from "@t3tools/contracts";

import { writeFileStringAtomically } from "./atomicWrite.ts";
import {
  decodePersistedRecipeWorkflowRunState,
  encodePersistedRecipeWorkflowRunState,
  type PersistedRecipeWorkflowRunState,
  workflowRunIdForThread,
} from "./t3work-recipeWorkflowRuntimeShared.ts";
import {
  legacyWorkflowStatePath,
  workflowStatePathForRun,
} from "./t3work-recipeWorkflowRunPaths.ts";

export const readPersistedWorkflowState = Effect.fn("readPersistedWorkflowState")(
  function* (input: { workspaceRoot: string; threadId: ThreadId }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const candidatePaths = [
      workflowStatePathForRun(
        pathService,
        input.workspaceRoot,
        workflowRunIdForThread(input.threadId),
      ),
      legacyWorkflowStatePath(pathService, input.workspaceRoot, input.threadId),
    ];

    for (const statePath of candidatePaths) {
      const exists = yield* fileSystem.exists(statePath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        continue;
      }
      const raw = yield* fileSystem.readFileString(statePath).pipe(Effect.orElseSucceed(() => ""));
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const decoded = yield* decodePersistedRecipeWorkflowRunState(trimmed).pipe(Effect.option);
      if (decoded._tag === "Some") {
        return decoded.value;
      }
    }

    return null;
  },
);

export const persistWorkflowState = Effect.fn("persistWorkflowState")(function* (
  state: PersistedRecipeWorkflowRunState,
) {
  const pathService = yield* Path.Path;
  const statePath = workflowStatePathForRun(pathService, state.workspaceRoot, state.workflowRunId);
  const encodedState = yield* encodePersistedRecipeWorkflowRunState(state);
  yield* writeFileStringAtomically({
    filePath: statePath,
    contents: encodedState,
  });
});

export const clearWorkflowState = Effect.fn("clearWorkflowState")(function* (input: {
  workspaceRoot: string;
  threadId: ThreadId;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  yield* fileSystem
    .remove(legacyWorkflowStatePath(pathService, input.workspaceRoot, input.threadId), {
      force: true,
    })
    .pipe(Effect.ignore({ log: true }));
});
