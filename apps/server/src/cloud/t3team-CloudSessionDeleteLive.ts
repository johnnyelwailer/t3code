/**
 * A delete refuses while another session could still restore or re-push what it removes: a live
 * run of the same workspace in the user's list or this server's claims, or any live broker
 * session of the user the run list cannot place (a claimed standby names no workspace, so it
 * cannot be ruled out). Answers the user's runs, which the plan reads too.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import { parseSessionRunIdentity } from "./t3team-CloudSessionDelete.ts";
import type { DeleteFlow } from "./t3team-CloudSessionDeleteFlow.ts";

const blocked = (message: string) =>
  new CloudSessionFailedError({ reason: "delete_blocked", message });

export const assertNoOtherLiveSession = Effect.fn("cloud.session.delete.live")(function* (
  flow: DeleteFlow,
  runId: number,
  workspace: string,
) {
  const login = yield* flow.gh.resolveLogin({ allowReserve: true });
  const runs = yield* flow.gh.listRunsFor(login, { allowReserve: true });
  const ofWorkspace = runs
    .filter((run) => parseSessionRunIdentity(run.name).workspace === workspace)
    .map((run) => ({ id: run.id, status: run.status }));
  const claimed = [...(yield* Ref.get(flow.claims)).entries()]
    .filter(([, entry]) => entry.login === login && entry.workspace === workspace)
    .map(([id]) => Number(id));
  for (const id of claimed) {
    if (id !== runId && !ofWorkspace.some((run) => run.id === id)) {
      ofWorkspace.push({ id, status: (yield* flow.gh.getRun(id, { allowReserve: true })).status });
    }
  }
  const live = ofWorkspace.find((run) => run.id !== runId && run.status !== "completed");
  if (live !== undefined) {
    return yield* blocked(
      `Another session of this machine is still running (run ${live.id}). Stop it first, then delete.`,
    );
  }
  if (flow.broker.enabled) {
    const sessions = yield* flow.broker.sessions.pipe(
      Effect.mapError(() =>
        blocked(
          "The broker's session list could not be read, so a running session of this machine cannot be ruled out. Try again.",
        ),
      ),
    );
    const listed = new Set([runId, ...runs.map((run) => run.id)].map(String));
    const unplaced = sessions.find((session) => !listed.has(session.runId));
    if (unplaced !== undefined) {
      return yield* blocked(
        `A cloud session of yours (run ${unplaced.runId}) is running where this device cannot tell its workspace. Stop it first, then delete.`,
      );
    }
  }
  return runs;
});
