import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { ThreadId } from "@t3tools/contracts";

import { writeFileStringAtomically } from "./atomicWrite.ts";
import {
  decodePersistedRecipeWorkflowRunState,
  encodePersistedRecipeWorkflowRunState,
  type PersistedRecipeWorkflowRunState,
  workflowStatePath,
} from "./t3work-recipeWorkflowRuntimeShared.ts";

export const readPersistedWorkflowState = Effect.fn("readPersistedWorkflowState")(
  function* (input: { workspaceRoot: string; threadId: ThreadId }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const statePath = workflowStatePath(pathService, input.workspaceRoot, input.threadId);
    const exists = yield* fileSystem.exists(statePath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return null;
    }

    const raw = yield* fileSystem.readFileString(statePath).pipe(Effect.orElseSucceed(() => ""));
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const decoded = yield* decodePersistedRecipeWorkflowRunState(trimmed).pipe(Effect.option);
    return decoded._tag === "Some" ? decoded.value : null;
  },
);

export const persistWorkflowState = Effect.fn("persistWorkflowState")(function* (
  state: PersistedRecipeWorkflowRunState,
) {
  const pathService = yield* Path.Path;
  const statePath = workflowStatePath(pathService, state.workspaceRoot, state.threadId as ThreadId);
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
    .remove(workflowStatePath(pathService, input.workspaceRoot, input.threadId), { force: true })
    .pipe(Effect.ignore({ log: true }));
});
