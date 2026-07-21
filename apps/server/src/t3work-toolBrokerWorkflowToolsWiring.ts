/**
 * Combines the `t3work.workflow.run`, `t3work.workflow.status`, and `t3work.workflow.resume`
 * per-thread wiring into one call. All are small `*Live.ts` builders that already resolve their
 * own optional durable-engine deps and return `undefined` when unwired; this just gives
 * `t3work-toolBrokerLive.ts` (already near the additive size budget) a single call site for the
 * cohesive "workflow tools" concern.
 */
import * as Effect from "effect/Effect";

import { makeWorkflowResumeToolsForThread } from "./t3work-toolBrokerWorkflowResumeLive.ts";
import { makeWorkflowRunToolsForThread } from "./t3work-toolBrokerWorkflowRunLive.ts";
import { makeWorkflowStatusToolsForThread } from "./t3work-toolBrokerWorkflowStatusLive.ts";

type WorkflowRunToolsDeps = Parameters<typeof makeWorkflowRunToolsForThread>[0];

export const makeWorkflowToolsForThread = Effect.fn("makeWorkflowToolsForThread")(function* (
  deps: WorkflowRunToolsDeps,
) {
  const workflowRunToolsForThread = yield* makeWorkflowRunToolsForThread(deps);
  const workflowStatusToolsForThread = yield* makeWorkflowStatusToolsForThread();
  const workflowResumeToolsForThread = yield* makeWorkflowResumeToolsForThread({
    fileSystem: deps.fileSystem,
    path: deps.path,
    dispatch: deps.dispatch,
    loadThreadProject: deps.loadThreadProject,
  });
  return { workflowRunToolsForThread, workflowStatusToolsForThread, workflowResumeToolsForThread };
});
