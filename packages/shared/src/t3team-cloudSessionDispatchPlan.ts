import { ORCHESTRATION_PROTOCOL_VERSION } from "@t3tools/contracts";

import {
  sessionTagMarker,
  type WorkflowRunSummary,
} from "./t3team-cloudSessionActionsRequests.ts";
import {
  type CloudSessionPlainProject,
  plainProjectDispatchInputs,
} from "./t3team-cloudSessionPlainProject.ts";

/**
 * The transport-free half of dispatching a cloud session: what the workflow is told
 * (`workflow_dispatch` inputs), when to look for the run it started, and which listed run is ours.
 * The server runs it through `gh`/`GitHubApi`; a phone runs it through `fetch` with the user's own
 * token. No Effect, no I/O, so both can import it.
 *
 * @module t3team-cloudSessionDispatchPlan
 */

/**
 * Which published session-server build the session installs (`server_ref`): the one tagged for this
 * client's orchestration protocol, so the server on the VM always speaks what the client that
 * dispatched it speaks. A rolling tag per protocol, not one shared "latest": a desktop on an older
 * protocol keeps getting a server it can talk to after a newer one is published.
 */
export const sessionServerRef = `protocol-${ORCHESTRATION_PROTOCOL_VERSION}`;

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

/** A project machine as the dispatch sees it: its token is NOT an input (broker secret). */
export interface DispatchMachine {
  readonly repository: { readonly url: string };
  readonly commit: string;
  readonly devcontainerPath: string;
  readonly healthCheck: string | null;
  readonly teamSecretNames: ReadonlyArray<string>;
}

/** A project checked out on the host so an agent can write its machine definition. */
export interface DispatchSetup {
  readonly repository: { readonly url: string };
  readonly commit: string;
}

export interface SessionDispatchOptions {
  readonly sessionTag: string;
  readonly durationSeconds: number;
  /** Set when the session is reached through the Nexi broker instead of T3 Connect. */
  readonly brokerGrant?: string | null | undefined;
  /** The creator's own workspace (`sessionWorkspaceName`); never shared between users. */
  readonly workspace: string;
  readonly machine?: DispatchMachine | null | undefined;
  readonly setup?: DispatchSetup | null | undefined;
  /** For a plain session: the project its server runs in (never with machine or setup). */
  readonly plain?: CloudSessionPlainProject | null | undefined;
}

/**
 * The `workflow_dispatch` inputs, in the order the workflow has always received them. The ref is
 * not here: it rides in the request (`dispatchSessionRequest`).
 */
export function sessionDispatchInputs(input: SessionDispatchOptions): Record<string, string> {
  return {
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
          ...(input.machine.healthCheck ? { machine_health_check: input.machine.healthCheck } : {}),
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
  };
}

/**
 * The listed run carrying THIS dispatch's tag. The workflow echoes the tag into `run-name`, the
 * only way to find our own run since `workflow_dispatch` answers 204 with no body; matching on it
 * (rather than "newest run we had not seen") keeps concurrent dispatches from handing each
 * other's sessions over.
 */
export function findTaggedRun(
  runs: ReadonlyArray<WorkflowRunSummary>,
  sessionTag: string,
): WorkflowRunSummary | undefined {
  const marker = sessionTagMarker(sessionTag);
  return runs.find((item) => item.name.includes(marker));
}
