/**
 * The workflow host's `launchThread` members (t3team-workflowHostLaunch.ts) as the host shape
 * carries them, and their Promise form for the engine's port. Split from `t3team-workflowHost.ts`
 * for the additive size budget; the host spreads both in.
 */
import * as Effect from "effect/Effect";

import { ThreadLaunchService } from "./orchestration-v2/ThreadLaunchService.ts";
import type { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import type { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import { failAsAnswer, type T3TeamWorkflowHostError } from "./t3team-workflowHostFail.ts";
import { makeWorkflowHostLaunch } from "./t3team-workflowHostLaunch.ts";
import type {
  WorkflowHostLaunchAnswer,
  WorkflowHostLaunchedThreadInput,
  WorkflowHostLaunchThreadInput,
  WorkflowHostPort,
} from "./t3team-workflowHostPort.ts";

export interface WorkflowHostLaunchMembers {
  readonly launchThread: (
    input: WorkflowHostLaunchThreadInput,
  ) => Effect.Effect<
    WorkflowHostLaunchAnswer<{ readonly threadId: string; readonly created: boolean }>,
    T3TeamWorkflowHostError
  >;
  readonly launchedThread: (
    input: WorkflowHostLaunchedThreadInput,
  ) => Effect.Effect<WorkflowHostLaunchAnswer<unknown>, T3TeamWorkflowHostError>;
  readonly setRunFacts: (
    input: Parameters<WorkflowHostPort["setRunFacts"]>[0],
  ) => Effect.Effect<WorkflowHostLaunchAnswer<void>, T3TeamWorkflowHostError>;
}

export const makeWorkflowHostLaunchMembers = (deps: {
  readonly threads: ThreadManagementService["Service"];
  readonly facts: T3TeamThreadFactsStore["Service"];
}) =>
  Effect.gen(function* () {
    const launch = makeWorkflowHostLaunch({
      ...deps,
      launches: yield* Effect.serviceOption(ThreadLaunchService),
    });
    return {
      launchThread: (input) => launch.launchThread(input).pipe(failAsAnswer("launchThread")),
      launchedThread: (input) => launch.launchedThread(input).pipe(failAsAnswer("launchedThread")),
      setRunFacts: (input) => launch.setRunFacts(input).pipe(failAsAnswer("setRunFacts")),
    } satisfies WorkflowHostLaunchMembers;
  });

export const launchPortOf = (
  host: WorkflowHostLaunchMembers,
): Pick<WorkflowHostPort, "launchThread" | "launchedThread" | "setRunFacts"> => ({
  launchThread: (input) => Effect.runPromise(host.launchThread(input)),
  launchedThread: (input) => Effect.runPromise(host.launchedThread(input)),
  setRunFacts: (input) => Effect.runPromise(host.setRunFacts(input)),
});
