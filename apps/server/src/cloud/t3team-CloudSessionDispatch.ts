import type { CloudSessionFailedError } from "@t3tools/contracts";
import {
  dispatchSessionRequest,
  type CloudSessionRepoRef,
  type GitHubActionsRequest,
  type GitHubActionsResponse,
  type WorkflowRunSummary,
} from "@t3tools/shared/t3team-cloudSessionActionsRequests";
import {
  discoveryDelayMs,
  findTaggedRun,
  sessionDispatchInputs,
} from "@t3tools/shared/t3team-cloudSessionDispatchPlan";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { pendingCloudSession, projectCloudSession } from "./t3team-CloudSessionProjection.ts";
import type { CloudSessionMachine, CloudSessionPlainProject, CloudSessionSetup } from "./t3team-CloudSessionMachine.ts";

type RunExecutor = (
  request: GitHubActionsRequest,
) => Effect.Effect<GitHubActionsResponse, CloudSessionFailedError>;
type ListRuns = Effect.Effect<ReadonlyArray<WorkflowRunSummary>, CloudSessionFailedError>;

/**
 * Dispatch the session workflow and wait for the run carrying THIS dispatch's
 * tag to surface.
 *
 * The tag is echoed into `run-name` by the workflow — the only way to find
 * our own run, since `workflow_dispatch` answers 204 with no body. Polling
 * for the tag (rather than "newest run we had not seen") is what keeps
 * concurrent dispatches from handing each other's sessions over.
 */
export const dispatchAndDiscoverSession = Effect.fn("cloud.session.dispatch_and_discover")(
  function* (input: {
    readonly repoRef: CloudSessionRepoRef;
    readonly sessionTag: string;
    readonly durationSeconds: number;
    readonly machineLabel: string;
    readonly run: RunExecutor;
    readonly listRuns: ListRuns;
    /** Backed-off looks (`discoveryDelayMs`) before giving up (the session is then "pending"). */
    readonly discoveryAttempts: number;
    /** Set when the session is reached through the Nexi broker instead of T3 Connect. */
    readonly brokerGrant?: string | null;
    /** The creator's own workspace (`sessionWorkspaceName`); never shared between users. */
    readonly workspace: string;
    /** Set when the session runs in a project machine; its token is NOT an input (broker secret). */
    readonly machine?: CloudSessionMachine | null;
    /** Set when the session checks the project out on the host so an agent can write a machine. */
    readonly setup?: CloudSessionSetup | null;
    /** Set for a plain session: the project its server runs in (never with machine or setup). */
    readonly plain?: CloudSessionPlainProject | null;
  }) {
    yield* input.run(dispatchSessionRequest(input.repoRef, sessionDispatchInputs(input)));

    // The run does not appear instantly, so poll for the one carrying our tag.
    const pollForTaggedRun = (
      attempt: number,
    ): Effect.Effect<WorkflowRunSummary | null, CloudSessionFailedError> =>
      attempt >= input.discoveryAttempts
        ? Effect.succeed(null)
        : Effect.gen(function* () {
            yield* Effect.sleep(Duration.millis(discoveryDelayMs(attempt)));
            const runs = yield* input.listRuns;
            const mine = findTaggedRun(runs, input.sessionTag);
            return mine === undefined ? yield* pollForTaggedRun(attempt + 1) : mine;
          });

    const discovered = yield* pollForTaggedRun(0);

    if (discovered === null) {
      return {
        ...pendingCloudSession(input.sessionTag, input.durationSeconds, input.machineLabel),
        transport: input.brokerGrant ? ("nexi_broker" as const) : ("t3_connect" as const),
        ...(input.machine ? { projectMachine: true } : {}),
        ...(input.setup ? { machineSetup: true } : {}),
      };
    }
    return yield* projectCloudSession(
      discovered,
      yield* Clock.currentTimeMillis,
      input.machineLabel,
      input.repoRef,
      input.run,
    );
  },
);
