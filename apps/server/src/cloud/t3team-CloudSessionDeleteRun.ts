/**
 * One cloud-session delete, in order: stop the run and wait for its teardown, name whose state it
 * left (the snapshot owner), refuse while another run of the workspace is live, save and remove
 * the machine's resume branch, then remove every snapshot the next session of the workspace
 * would restore. Anything it cannot attribute or reach fails the delete instead of reporting it.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  type DeleteFlow,
  type DeleteSessionContext,
  removeMachineCheckout,
} from "./t3team-CloudSessionDeleteFlow.ts";
import {
  assertNoOtherLiveRun,
  cancelSessionRun,
  removeCaches,
  scanSnapshotCaches,
  waitForRunEnd,
} from "./t3team-CloudSessionDeleteSteps.ts";
import { BROKER_RUN_NAME_MARKER } from "./t3team-CloudSessionProjection.ts";
import { snapshotOwnerOf } from "./t3team-cloudSessionSnapshotOwner.ts";

const blocked = (message: string) =>
  new CloudSessionFailedError({ reason: "delete_blocked", message });

export const deleteCloudSession = Effect.fn("cloud.session.delete.run")(function* (
  flow: DeleteFlow,
  context: DeleteSessionContext,
) {
  // A claimed standby's run is read directly: it is not in the caller's list.
  const run = context.run ?? (yield* flow.gh.getRun(context.runId, { allowReserve: true }));
  if (run.status !== "completed") {
    // Its teardown saves the snapshot and preserves the checkout the delete then removes.
    yield* cancelSessionRun(flow, context.runId);
    yield* waitForRunEnd(flow, context.runId);
  }

  const scan = yield* scanSnapshotCaches(flow);
  const ownKeys = scan.entries.filter((entry) => entry.runId === context.runId);
  const workspaces = new Set(ownKeys.map((entry) => entry.workspace));
  const workspace = context.workspace ?? (workspaces.size === 1 ? [...workspaces][0]! : null);
  if (workspace !== null && [...workspaces].some((other) => other !== workspace)) {
    return yield* blocked(
      "This session's snapshots name another workspace than its run, so nothing was deleted.",
    );
  }
  const snapshotOwner = snapshotOwnerOf({
    brokerRun: context.kind === "claimed" || run.name.includes(BROKER_RUN_NAME_MARKER),
    actorId: run.actorId ?? null,
    runCacheOwners: ownKeys.map((entry) => entry.owner),
  });
  const workspaceKeys =
    workspace === null ? ownKeys : scan.entries.filter((entry) => entry.workspace === workspace);
  if (snapshotOwner === null && workspaceKeys.length > 0) {
    return yield* blocked(
      "This machine's owner cannot be identified, so its saved snapshots were left alone. Stop it instead.",
    );
  }

  if (workspace !== null) yield* assertNoOtherLiveRun(flow, context.runId, workspace);
  const wipBranch = yield* removeMachineCheckout(flow, context, snapshotOwner);
  yield* removeCaches(
    flow,
    workspaceKeys.filter((entry) => entry.owner === snapshotOwner).map((entry) => entry.id),
  );
  if (!scan.complete) {
    return yield* new CloudSessionFailedError({
      reason: "unreachable",
      message: `The fleet holds more caches than one delete reads, so the machine's snapshots were not fully removed${wipBranch === null ? "" : ` (its work is saved on ${wipBranch})`}. Delete it again to remove the rest.`,
    });
  }
  return { wipBranch, warnings: [] as ReadonlyArray<string> };
});
