import { CloudSessionFailedError, ORCHESTRATION_PROTOCOL_VERSION } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import type * as VcsProcess from "../vcs/VcsProcess.ts";
import {
  dispatchSessionInvocation,
  sessionTagMarker,
  type CloudSessionRepoRef,
  type GhInvocation,
  type WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";
import { pendingCloudSession, projectCloudSession } from "./t3team-CloudSessionProjection.ts";
import type { CloudSessionMachine } from "./t3team-CloudSessionMachine.ts";

/**
 * Which published session-server build the session installs (`server_ref`): the one tagged for this
 * client's orchestration protocol, so the server on the VM always speaks what the client that
 * dispatched it speaks. A rolling tag per protocol, not one shared "latest": a desktop on an older
 * protocol keeps getting a server it can talk to after a newer one is published.
 */
export const sessionServerRef = `protocol-${ORCHESTRATION_PROTOCOL_VERSION}`;

type RunExecutor = (
  invocation: GhInvocation,
) => Effect.Effect<VcsProcess.VcsProcessOutput, CloudSessionFailedError>;
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
    /** One-second polls before giving up (the session is then "pending"). */
    readonly discoveryAttempts: number;
    /** Set when the session is reached through the Nexi broker instead of T3 Connect. */
    readonly brokerGrant?: string | null;
    /** Set when the session runs in a project machine; its token is NOT an input (broker secret). */
    readonly machine?: CloudSessionMachine | null;
  }) {
    const marker = sessionTagMarker(input.sessionTag);

    yield* input.run(
      dispatchSessionInvocation(input.repoRef, {
        hold_minutes: String(Math.max(1, Math.round(input.durationSeconds / 60))),
        session_tag: input.sessionTag,
        server_ref: sessionServerRef,
        ...(input.brokerGrant ? { broker_grant: input.brokerGrant } : {}),
        ...(input.machine
          ? {
              machine_repository: input.machine.repository.url,
              machine_commit: input.machine.commit,
              machine_devcontainer: input.machine.devcontainerPath,
              ...(input.machine.healthCheck
                ? { machine_health_check: input.machine.healthCheck }
                : {}),
              workspace: input.machine.workspace,
            }
          : {}),
      }),
    );

    // The run does not appear instantly, so poll for the one carrying our tag.
    const pollForTaggedRun = (
      attemptsLeft: number,
    ): Effect.Effect<WorkflowRunSummary | null, CloudSessionFailedError> =>
      attemptsLeft <= 0
        ? Effect.succeed(null)
        : Effect.gen(function* () {
            yield* Effect.sleep("1 second");
            const runs = yield* input.listRuns;
            const mine = runs.find((item) => item.name.includes(marker));
            return mine === undefined ? yield* pollForTaggedRun(attemptsLeft - 1) : mine;
          });

    const discovered = yield* pollForTaggedRun(input.discoveryAttempts);

    if (discovered === null) {
      return {
        ...pendingCloudSession(input.sessionTag, input.durationSeconds, input.machineLabel),
        transport: input.brokerGrant ? ("nexi_broker" as const) : ("t3_connect" as const),
        ...(input.machine ? { projectMachine: true } : {}),
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
