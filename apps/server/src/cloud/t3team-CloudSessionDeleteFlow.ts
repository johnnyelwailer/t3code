/**
 * The cloud-session delete flow: identify the machine, stop the run, save its unpushed work
 * to a `wip/` branch, then remove the resume branch and the workspace's snapshot caches.
 * Nothing is removed before the work is saved; a step that cannot guarantee that blocks the
 * whole delete as `delete_blocked`, never deletes around it.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  type CloudSessionRepoRef,
  type WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";
import {
  machineRepositoryFromRemote,
  type MachineRepository,
} from "./t3team-cloudSessionMachineNames.ts";
import { parseSessionRunIdentity, type SessionRepository } from "./t3team-CloudSessionDelete.ts";
import type { MachineStateOperations } from "./t3team-CloudSessionMachineState.ts";
import type { makeSessionGh } from "./t3team-CloudSessionGh.ts";
import type { ClaimLedger } from "./t3team-CloudSessionClaim.ts";
import { claimedIdentity, isClaimed } from "./t3team-CloudSessionClaim.ts";
import type { NexiBrokerService } from "./t3team-NexiBrokerService.ts";

/** The session gh operations a delete uses (makeSessionGh's result provides them). */
export type DeleteGh = Pick<
  Effect.Success<ReturnType<typeof makeSessionGh>>,
  "resolveLogin" | "listRunsFor" | "getRun" | "runInteractive"
>;

/** The delete's view of this session and its machine. */
export interface DeleteSessionContext {
  readonly runId: number;
  /** "run": the caller's own listed run; "claimed": a warm standby this server claimed. */
  readonly kind: "run" | "claimed";
  readonly run: WorkflowRunSummary | null;
  readonly workspace: string | null;
  readonly repository: SessionRepository | null;
}

export interface LocalProjectRef {
  readonly title: string;
  readonly workspaceRoot: string;
  /** The origin remote, or null when the project has none. */
  readonly remoteUrl: string | null;
}

export interface DeleteFlow {
  readonly repoRef: CloudSessionRepoRef;
  readonly gh: DeleteGh;
  readonly claims: ClaimLedger;
  readonly broker: NexiBrokerService["Service"];
  readonly machineState: MachineStateOperations;
  /** This server's active projects, capped; enough to name the machine's project and find its checkout. */
  readonly listLocalProjects: () => Effect.Effect<
    ReadonlyArray<LocalProjectRef>,
    CloudSessionFailedError
  >;
  /** The commit a local checkout is pinned to (machineRepositoryAccess). */
  readonly pinnedCommitFor: (root: string) => Effect.Effect<string | null, CloudSessionFailedError>;
}

const notFound = (message: string) =>
  new CloudSessionFailedError({ reason: "unknown_session", message });

/**
 * Locate the session being deleted and recover its machine's identity (workspace + repository)
 * from the run name's markers, or from the claim this server made. Fails closed when the
 * machine cannot be identified: a delete that guesses a repository could remove someone else's
 * machine.
 */
export const findSessionForDelete = Effect.fn("cloud.session.delete.find")(function* (
  flow: DeleteFlow,
  input: { readonly sessionId: string },
) {
  const runId = Number(input.sessionId);
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    return yield* notFound("That session cannot be deleted yet.");
  }
  const { gh } = flow;
  const login = yield* gh.resolveLogin({ allowReserve: true });
  const sessionRuns = yield* gh.listRunsFor(login, { allowReserve: true });
  const sessionRun = sessionRuns.find((item) => item.id === runId);
  if (sessionRun !== undefined) {
    const identity = parseSessionRunIdentity(sessionRun.name);
    // A machine session whose run predates the `· repo` marker cannot have its repository
    // identified: deleting it would leave its machine's checkout behind, so refuse it, not
    // delete around it.
    const hasMachine =
      sessionRun.name.includes(" · machine ") || sessionRun.name.endsWith(" · machine");
    if (hasMachine && identity.repository === null) {
      return yield* new CloudSessionFailedError({
        reason: "delete_blocked",
        message:
          "This session is too old to identify its machine's repository, so its checkout cannot be checked. Stop it, or check the project's nexi-resume branch.",
      });
    }
    return {
      runId,
      kind: "run" as const,
      run: sessionRun,
      workspace: identity.workspace,
      repository: identity.repository,
    } satisfies DeleteSessionContext;
  }
  // A claimed standby runs under the pool controller, not this login: the claim proves it.
  const claimedHere =
    (yield* isClaimed(flow.claims, input.sessionId, login)) ||
    (flow.broker.enabled
      ? (yield* flow.broker.sessions.pipe(Effect.orElseSucceed(() => []))).some(
          (session) => session.runId === input.sessionId,
        )
      : false);
  if (claimedHere) {
    const identity = yield* claimedIdentity(flow.claims, input.sessionId, login);
    if (identity === null) {
      return yield* new CloudSessionFailedError({
        reason: "delete_blocked",
        message:
          "This machine's workspace cannot be identified on this server (it started before a server restart). Stop it, or check the project's nexi-resume branch.",
      });
    }
    return {
      runId,
      kind: "claimed" as const,
      run: null,
      workspace: identity.workspace,
      repository: machineRepositoryFromRemote(identity.repository),
    } satisfies DeleteSessionContext;
  }
  return yield* notFound("That session does not exist.");
});

/**
 * Remove the machine's persistent checkout: save its unpushed work to the `wip/` branch, then
 * delete the resume branch. `repository` null means a plain workspace session, which has no
 * machine checkout.
 */
export const removeMachineCheckout = Effect.fn("cloud.session.delete.checkout")(function* (
  flow: DeleteFlow,
  context: DeleteSessionContext,
  snapshotOwner: string | null,
) {
  const { repository } = context;
  if (repository === null) return null;
  if (context.workspace === null) {
    // A machine run without a workspace marker predates the markers the delete relies on.
    return yield* new CloudSessionFailedError({
      reason: "delete_blocked",
      message:
        "This session is too old to identify its workspace, so its checkout cannot be checked. Stop it, or check the project's nexi-resume branch.",
    });
  }
  const local = (yield* flow.listLocalProjects()).find((project) => {
    const projectRepository = machineRepositoryFromRemote(project.remoteUrl ?? "");
    return projectRepository !== null && sameRepository(projectRepository, repository);
  });
  if (local === undefined) {
    return yield* new CloudSessionFailedError({
      reason: "delete_blocked",
      message: `No open project points at ${repository.host}/${repository.owner}/${repository.name} on this server, so its machine's work cannot be checked. Open the project and try again.`,
    });
  }
  const pinnedSha = yield* flow.pinnedCommitFor(local.workspaceRoot);
  const result = yield* flow.machineState.deleteMachineCheckout({
    host: repository.host,
    owner: repository.owner,
    name: repository.name,
    localRoot: local.workspaceRoot,
    pinnedSha,
    snapshotOwner,
    workspace: context.workspace,
    runId: context.runId,
  });
  return result.wipBranch;
});

/** Host, owner and name: one forge's `acme/api` is not another's. */
export function sameRepository(a: MachineRepository, b: SessionRepository): boolean {
  return (
    [a.host, a.owner, a.name].join("/").toLowerCase() ===
    [b.host, b.owner, b.name].join("/").toLowerCase()
  );
}
