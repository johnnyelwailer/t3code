import { CloudSessionFailedError, ORCHESTRATION_PROTOCOL_VERSION } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import {
  dispatchSessionRequest,
  sessionTagMarker,
  type CloudSessionRepoRef,
  type GitHubActionsRequest,
  type GitHubActionsResponse,
  type WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";
import { pendingCloudSession, projectCloudSession } from "./t3team-CloudSessionProjection.ts";
import type { CloudSessionMachine, CloudSessionSetup } from "./t3team-CloudSessionMachine.ts";
import {
  type CloudSessionPlainProject,
  plainProjectDispatchInputs,
} from "./t3team-cloudSessionPlainProject.ts";

/**
 * Which published session-server build the session installs (`server_ref`): the one tagged for this
 * client's orchestration protocol, so the server on the VM always speaks what the client that
 * dispatched it speaks. A rolling tag per protocol, not one shared "latest": a desktop on an older
 * protocol keeps getting a server it can talk to after a newer one is published.
 */
const sessionServerRef = `protocol-${ORCHESTRATION_PROTOCOL_VERSION}`;

const DISCOVERY_FIRST_DELAY_MS = 1_000;
const DISCOVERY_MAX_DELAY_MS = 8_000;
const DISCOVERY_GROWTH = 1.6;

/**
 * Wait before the `attempt`th look for the dispatched run (0-based): a quick first look, then
 * backing off, so a slow host is not asked ten times in ten seconds.
 */
export function discoveryDelayMs(attempt: number): number {
  return Math.min(
    Math.round(DISCOVERY_FIRST_DELAY_MS * DISCOVERY_GROWTH ** attempt),
    DISCOVERY_MAX_DELAY_MS,
  );
}

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
    const marker = sessionTagMarker(input.sessionTag);

    yield* input.run(
      dispatchSessionRequest(input.repoRef, {
        hold_minutes: String(Math.max(1, Math.round(input.durationSeconds / 60))),
        session_tag: input.sessionTag,
        workspace: input.workspace,
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
              ...(input.machine.teamSecretNames.length > 0
                ? { machine_team_secrets: input.machine.teamSecretNames.join(",") }
                : {}),
            }
          : {}),
        ...(input.setup
          ? {
              machine_repository: input.setup.repository.url,
              machine_commit: input.setup.commit,
              machine_setup: "true",
            }
          : {}),
        ...plainProjectDispatchInputs(input.plain),
      }),
    );

    // The run does not appear instantly, so poll for the one carrying our tag.
    const pollForTaggedRun = (
      attempt: number,
    ): Effect.Effect<WorkflowRunSummary | null, CloudSessionFailedError> =>
      attempt >= input.discoveryAttempts
        ? Effect.succeed(null)
        : Effect.gen(function* () {
            yield* Effect.sleep(Duration.millis(discoveryDelayMs(attempt)));
            const runs = yield* input.listRuns;
            const mine = runs.find((item) => item.name.includes(marker));
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
