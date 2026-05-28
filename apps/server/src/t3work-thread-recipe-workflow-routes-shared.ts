import { type ProviderInteractionMode, type RuntimeMode, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { T3workAtlassianError } from "./t3work-atlassian-http.ts";

export function isRuntimeMode(value: string): value is RuntimeMode {
  return value === "approval-required" || value === "auto-accept-edits" || value === "full-access";
}

export function isProviderInteractionMode(value: string): value is ProviderInteractionMode {
  return value === "default" || value === "plan";
}

export const loadThreadProjectContext = Effect.fn("loadThreadProjectContext")(function* (
  threadId: ThreadId,
) {
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const thread = yield* projectionSnapshotQuery
    .getThreadDetailById(threadId)
    .pipe(Effect.map((threadOption) => (threadOption._tag === "Some" ? threadOption.value : null)));
  if (!thread) {
    return yield* new T3workAtlassianError({ message: "Thread not found." });
  }

  const project = yield* projectionSnapshotQuery
    .getProjectShellById(thread.projectId)
    .pipe(
      Effect.map((projectOption) => (projectOption._tag === "Some" ? projectOption.value : null)),
    );
  if (!project) {
    return yield* new T3workAtlassianError({ message: "Project not found." });
  }

  return { project, thread };
});
