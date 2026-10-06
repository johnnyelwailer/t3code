import { type ProviderInteractionMode, type RuntimeMode, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import { makeT3TeamThreadReads } from "./t3team-toolBrokerThreadReads.ts";

export function isRuntimeMode(value: string): value is RuntimeMode {
  return value === "approval-required" || value === "auto-accept-edits" || value === "full-access";
}

export function isProviderInteractionMode(value: string): value is ProviderInteractionMode {
  return value === "default" || value === "plan";
}

/** The V2 thread + project pair a workflow route works against (the broker's own read). */
export const makeWorkflowRouteThreadReads = Effect.gen(function* () {
  return makeT3TeamThreadReads({
    threads: yield* ThreadManagementService,
    projects: yield* ProjectStoreV2,
  });
});

export const loadThreadProjectContext = Effect.fn("loadThreadProjectContext")(function* (
  threadId: ThreadId,
) {
  const reads = yield* makeWorkflowRouteThreadReads;
  return yield* reads
    .loadThreadProject(threadId)
    .pipe(Effect.mapError((message) => new T3TeamAtlassianError({ message })));
});
