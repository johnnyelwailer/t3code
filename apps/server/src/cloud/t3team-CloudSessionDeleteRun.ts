/**
 * One cloud-session delete, in order: refuse early what the plan already refuses, stop the run and
 * wait for its teardown, require that teardown saved the machine's last state, then plan again on
 * the final state, save and remove the resume branch, and remove the workspace's snapshots. A
 * removal it cannot confirm fails the delete instead of reporting it done.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  type DeleteFlow,
  type DeleteSessionContext,
  sameRepository,
} from "./t3team-CloudSessionDeleteFlow.ts";
import { machineRepositoryFromRemote } from "./t3team-cloudSessionMachineNames.ts";
import { planDelete } from "./t3team-CloudSessionDeletePlan.ts";
import {
  assertTeardownSaved,
  cancelSessionRun,
  removeCaches,
  waitForRunEnd,
} from "./t3team-CloudSessionDeleteSteps.ts";

export const deleteCloudSession = Effect.fn("cloud.session.delete.run")(function* (
  flow: DeleteFlow,
  context: DeleteSessionContext,
) {
  // A claimed standby's run is read directly: it is not in the caller's list.
  const run = context.run ?? (yield* flow.gh.getRun(context.runId, { allowReserve: true }));
  yield* planDelete(flow, context, run, "preview");
  if (run.status !== "completed") {
    // Its teardown saves the snapshot and preserves the checkout the delete then removes.
    yield* cancelSessionRun(flow, context.runId);
    yield* waitForRunEnd(flow, context.runId);
  }
  yield* assertTeardownSaved(flow, context.runId, context.repository !== null);

  const plan = yield* planDelete(flow, context, run, "final");
  const wipBranch =
    plan.checkout === null
      ? null
      : (yield* flow.machineState.deleteMachineCheckout({
          ...plan.checkout,
          snapshotOwner: plan.snapshotOwner,
          workspace: plan.workspace,
          runId: context.runId,
        })).wipBranch;
  const left =
    plan.keyPrefix === null ? [] : yield* removeCaches(flow, plan.cacheIds, plan.keyPrefix);
  if (left.length > 0 || !plan.cachesComplete) {
    return yield* new CloudSessionFailedError({
      reason: "unreachable",
      message: `The machine's snapshots were not fully removed${wipBranch === null ? "" : ` (its work is saved on ${wipBranch})`}. Delete it again to remove the rest.`,
    });
  }
  return { wipBranch, warnings: [] as ReadonlyArray<string> };
});

/**
 * What the confirmation names before anything is removed: the machine's repository, this
 * server's projects on it, and how many earlier sessions' saved state goes with it.
 */
export const describeCloudSessionDelete = Effect.fn("cloud.session.delete.info")(function* (
  flow: DeleteFlow,
  context: DeleteSessionContext,
) {
  const run = context.run ?? (yield* flow.gh.getRun(context.runId, { allowReserve: true }));
  const plan = yield* planDelete(flow, context, run, "preview");
  const wanted = context.repository;
  const projects =
    wanted === null
      ? []
      : (yield* flow.listLocalProjects())
          .filter((project) => {
            const repository = machineRepositoryFromRemote(project.remoteUrl ?? "");
            return repository !== null && sameRepository(repository, wanted);
          })
          .map((project) => project.title);
  return {
    repository: wanted === null ? null : `${wanted.owner}/${wanted.name}`,
    projects,
    otherSessions: plan.otherSessions.length,
  };
});
