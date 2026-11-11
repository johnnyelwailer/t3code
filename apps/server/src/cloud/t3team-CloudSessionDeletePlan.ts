/**
 * What one delete may remove (workspace, snapshot owner, `<owner>.<workspace>/` snapshots, the
 * checkout), decided first; `delete_blocked` unless provably this session's. `preview` (before
 * the stop) tolerates an owner the run has not written yet; `final` does not.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { parseSessionRunIdentity } from "./t3team-CloudSessionDelete.ts";
import {
  type DeleteFlow,
  type DeleteSessionContext,
  type LocalCheckout,
  resolveLocalCheckout,
} from "./t3team-CloudSessionDeleteFlow.ts";
import { scanSnapshotCaches, type SnapshotScan } from "./t3team-CloudSessionDeleteSteps.ts";
import { assertNoOtherLiveSession } from "./t3team-CloudSessionDeleteLive.ts";
import { BROKER_RUN_NAME_MARKER } from "./t3team-CloudSessionProjection.ts";
import { ENTRA_OWNER, snapshotOwnerOf } from "./t3team-cloudSessionSnapshotOwner.ts";
import type { WorkflowRunSummary } from "./t3team-githubActionsSessionClient.ts";

const SNAPSHOT_KEY_PREFIX = "nexi-session-userdata-";

export interface DeletePlan {
  readonly workspace: string;
  readonly snapshotOwner: string | null;
  readonly checkout: LocalCheckout | null;
  /** Every snapshot to remove; all under `keyPrefix`. */
  readonly cacheIds: ReadonlyArray<number>;
  readonly keyPrefix: string | null;
  /** False when the workspace holds more snapshots than one delete reads. */
  readonly cachesComplete: boolean;
  /** Earlier sessions of the workspace whose saved state goes with this one. */
  readonly otherSessions: ReadonlyArray<number>;
}

const blocked = (message: string) =>
  new CloudSessionFailedError({ reason: "delete_blocked", message });

export const planDelete = Effect.fn("cloud.session.delete.plan")(function* (
  flow: DeleteFlow,
  context: DeleteSessionContext,
  run: WorkflowRunSummary,
  mode: "preview" | "final" = "final",
) {
  const brokerRun = context.kind === "claimed" || run.name.includes(BROKER_RUN_NAME_MARKER);
  const actorId = run.actorId ?? null;
  let workspace = context.workspace;
  let owner = snapshotOwnerOf({ brokerRun, actorId, runCacheOwners: [] });
  let broad: SnapshotScan | null = null;
  if (workspace === null || owner === null) {
    // The run's own snapshot keys name the workspace and owner session.yml used.
    broad = yield* scanSnapshotCaches(flow, SNAPSHOT_KEY_PREFIX);
    const own = broad.entries.filter((entry) => entry.runId === context.runId);
    const ownWorkspaces = new Set(own.map((entry) => entry.workspace));
    if (
      ownWorkspaces.size > 1 ||
      (workspace !== null && own.some((e) => e.workspace !== workspace))
    ) {
      return yield* blocked(
        "This session's snapshots name another workspace than its run. Nothing was deleted.",
      );
    }
    workspace ??= own[0]?.workspace ?? null;
    owner = snapshotOwnerOf({ brokerRun, actorId, runCacheOwners: own.map((e) => e.owner) });
  }
  if (workspace === null) {
    return yield* blocked(
      "This session is too old to identify its workspace, so nothing of it can be deleted safely. Stop it instead.",
    );
  }
  if (context.repository === null && workspace.startsWith("m-")) {
    return yield* blocked(
      "This session was started by an older app that did not name its repository, so its checkout cannot be checked. Stop it, or check the project's nexi-resume branch.",
    );
  }
  const checkout =
    context.repository === null || mode === "preview"
      ? null
      : yield* resolveLocalCheckout(flow, context.repository);
  if (checkout !== null && owner === null) {
    owner = yield* ownerFromResumeBranches(flow, checkout, workspace, brokerRun);
  }
  const ws = workspace;
  const unattributed = broad?.entries.filter((entry) => entry.workspace === ws) ?? [];
  if (owner === null && mode === "final" && (unattributed.length > 0 || broad?.complete !== true)) {
    return yield* blocked(
      "This machine's owner cannot be identified, so its saved state was left alone. Stop it instead.",
    );
  }

  const keyPrefix = owner === null ? null : `${SNAPSHOT_KEY_PREFIX}${owner}.${workspace}/`;
  const scan =
    keyPrefix === null
      ? { entries: unattributed, complete: broad?.complete ?? true }
      : yield* scanSnapshotCaches(flow, keyPrefix);
  const runs = yield* assertNoOtherLiveSession(flow, context.runId, workspace);
  const otherSessions = [
    ...new Set([
      ...scan.entries.map((entry) => entry.runId),
      ...runs.filter((r) => parseSessionRunIdentity(r.name).workspace === ws).map((r) => r.id),
    ]),
  ].filter((id) => id !== context.runId);

  const later = otherSessions.find((id) => id > context.runId);
  if (later !== undefined) {
    return yield* blocked(
      `A later session of this machine (run ${later}) holds newer state. Delete that one instead.`,
    );
  }
  if (workspace.startsWith("u-") && otherSessions.length > 0) {
    return yield* blocked(
      `Sessions without a repository share one workspace, and ${otherSessions.length} other session(s) used it (run ${otherSessions[0]}): deleting would remove their projects too. Stop this one instead.`,
    );
  }
  return {
    workspace,
    snapshotOwner: owner,
    checkout,
    cacheIds: keyPrefix === null ? [] : scan.entries.map((entry) => entry.id),
    keyPrefix,
    cachesComplete: scan.complete,
    otherSessions,
  } satisfies DeletePlan;
});

/**
 * A broker run whose snapshots are gone names its owner by the workspace's only resume branch;
 * branches of more than one owner, or of a non-broker shape, leave it unknown on purpose.
 */
const ownerFromResumeBranches = Effect.fn("cloud.session.delete.plan.owner")(function* (
  flow: DeleteFlow,
  checkout: LocalCheckout,
  workspace: string,
  brokerRun: boolean,
) {
  const branches = yield* flow.machineState.listResumeBranches({ ...checkout, workspace });
  const owners = [...new Set(branches.map((branch) => branch.owner))];
  if (owners.length === 0) return null;
  const [only] = owners;
  if (owners.length > 1 || only === undefined || !brokerRun || !ENTRA_OWNER.test(only)) {
    return yield* blocked(
      `This machine's resume branches (${branches.map((b) => b.branch).join(", ")}) cannot be attributed to this session, so they were left alone.`,
    );
  }
  return only;
});
