/**
 * The Promise view of `T3TeamWorkflowHost` the engine calls (`WorkflowHostPort`); host failures
 * reject with the host error. Re-exported from `t3team-workflowHost.ts`.
 */
import * as Effect from "effect/Effect";

import type { T3TeamWorkflowHostShape } from "./t3team-workflowHost.ts";
import { launchPortOf } from "./t3team-workflowHostLaunchMembers.ts";
import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";

export const toWorkflowHostPort = (host: T3TeamWorkflowHostShape): WorkflowHostPort => ({
  createThread: (input) => Effect.runPromise(host.createThread(input)),
  startTurn: (input) => Effect.runPromise(host.startTurn(input)),
  postMessage: (input) => Effect.runPromise(host.postMessage(input)),
  upsertActivity: (input) => Effect.runPromise(host.upsertActivity(input)),
  interrupt: (input) => Effect.runPromise(host.interrupt(input)),
  archiveThread: (threadId) => Effect.runPromise(host.archiveThread(threadId)),
  syncRunFacts: (launchThreadId) => Effect.runPromise(host.syncRunFacts(launchThreadId)),
  ...launchPortOf(host),
});
