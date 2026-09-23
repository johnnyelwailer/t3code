import { CloudSessionFailedError } from "@t3tools/contracts";
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
import {
  pendingCloudSession,
  projectCloudSession,
} from "./t3team-CloudSessionProjection.ts";

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
export const dispatchAndDiscoverSession = Effect.fn(
  "cloud.session.dispatch_and_discover",
)(function* (input: {
  readonly repoRef: CloudSessionRepoRef;
  readonly sessionTag: string;
  readonly durationSeconds: number;
  readonly machineLabel: string;
  readonly run: RunExecutor;
  readonly listRuns: ListRuns;
  /** One-second polls before giving up (the session is then "pending"). */
  readonly discoveryAttempts: number;
}) {
  const marker = sessionTagMarker(input.sessionTag);

  yield* input.run(
    dispatchSessionInvocation(input.repoRef, {
      hold_minutes: String(Math.max(1, Math.round(input.durationSeconds / 60))),
      session_tag: input.sessionTag,
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
    return pendingCloudSession(input.sessionTag, input.durationSeconds, input.machineLabel);
  }
  return yield* projectCloudSession(
    discovered,
    yield* Clock.currentTimeMillis,
    input.machineLabel,
    input.repoRef,
    input.run,
  );
});
