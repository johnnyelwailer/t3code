/**
 * Combines the `t3team.orchestration.run`, `.status`, `.resume`, and `.pause` / `.stop` per-thread
 * wiring into one call. All are small `*Live.ts` builders that already resolve their own optional
 * durable-engine deps and return `undefined` when unwired; this just gives
 * `t3team-toolBrokerLive.ts` (already near the additive size budget) a single call site for the
 * cohesive "workflow tools" concern.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { makeWorkflowControlToolsForThread } from "./t3team-toolBrokerWorkflowControlLive.ts";
import { makeWorkflowResumeToolsForThread } from "./t3team-toolBrokerWorkflowResumeLive.ts";
import { makeWorkflowRunToolsForThread } from "./t3team-toolBrokerWorkflowRunLive.ts";
import { makeWorkflowStatusToolsForThread } from "./t3team-toolBrokerWorkflowStatusLive.ts";

type WorkflowRunToolsDeps = Parameters<typeof makeWorkflowRunToolsForThread>[0];

export const makeWorkflowToolsForThread = Effect.fn("makeWorkflowToolsForThread")(function* (
  deps: WorkflowRunToolsDeps,
) {
  // Control tools first: the run tool's `replaceRunId` stops the previous run through the same
  // sequence as the card's Stop and the agent's stop tool (GHE #415).
  const workflowControlToolsForThread = yield* makeWorkflowControlToolsForThread();
  const workflowRunToolsForThread = yield* makeWorkflowRunToolsForThread({
    ...deps,
    ...(workflowControlToolsForThread === undefined
      ? {}
      : {
          stopRun: (threadId: ThreadId, runId: string) =>
            workflowControlToolsForThread(threadId)
              .controlWorkflowRun("stop", { runId })
              .pipe(Effect.asVoid),
        }),
  });
  const workflowStatusToolsForThread = yield* makeWorkflowStatusToolsForThread();
  const workflowResumeToolsForThread = yield* makeWorkflowResumeToolsForThread({
    fileSystem: deps.fileSystem,
    path: deps.path,
    dispatch: deps.dispatch,
    loadThreadProject: deps.loadThreadProject,
  });
  return {
    workflowRunToolsForThread,
    workflowStatusToolsForThread,
    workflowResumeToolsForThread,
    workflowControlToolsForThread,
  };
});
