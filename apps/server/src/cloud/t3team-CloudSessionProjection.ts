import type { CloudSession, CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

import type * as VcsProcess from "../vcs/VcsProcess.ts";
import { cloudSessionElapsedSeconds, deriveCloudSessionPhase } from "./t3team-cloudSessionPhase.ts";
import {
  jobStepsInvocation,
  type CloudSessionRepoRef,
  type GhInvocation,
  parseJobStepsResponse,
  type WorkflowJobStep,
  type WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";

/**
 * Session identity and the run → session projection: turning raw GitHub
 * Actions runs (and a dispatch that has not surfaced yet) into the
 * user-visible `CloudSession` the contract defines.
 */

/**
 * A correlation tag for one dispatch. Random rather than time-based: two
 * clients dispatching in the same millisecond must not collide, which is the
 * whole failure this exists to prevent.
 */
export const makeSessionTag = Effect.map(
  Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER),
  (value) => `s${value.toString(36)}`,
);

/**
 * The gh executor the projection runs through: one invocation, already
 * error-mapped to `CloudSessionFailedError` by the service.
 */
export type GhExecutor = (
  invocation: GhInvocation,
) => Effect.Effect<VcsProcess.VcsProcessOutput, CloudSessionFailedError>;

/**
 * The session to report while a dispatch's run is not visible yet. Under the
 * tag-derived id rather than a throwaway one, so a later `list` resolves the
 * same session to the same identity and `cancel` keeps working once the run
 * appears.
 */
export function pendingCloudSession(
  sessionTag: string,
  durationSeconds: number,
  machineLabel: string,
): CloudSession {
  // `pending:` marks an id that is not a run number: `cancel` relies on that
  // to answer "not yet" instead of a rejected run lookup.
  return {
    sessionId: `pending:${sessionTag}`,
    providerKind: "github_actions",
    phase: "requested",
    elapsedSeconds: 0,
    remainingSeconds: durationSeconds,
    machineLabel,
    failureReason: null,
    detailsUrl: null,
  } satisfies CloudSession;
}

/**
 * Fetching steps costs one `gh` call per run, and only a moving run can change
 * phase from its steps — a settled run's phase comes from status/conclusion
 * alone. Skipping settled runs keeps a full list to a handful of calls.
 */
const isRunSettled = (run: WorkflowRunSummary): boolean => run.status === "completed";

/**
 * Project one provisioning run into the `CloudSession` the client renders.
 */
export const projectCloudSession = (
  sessionRun: WorkflowRunSummary,
  nowMs: number,
  machineLabel: string,
  repoRef: CloudSessionRepoRef,
  run: GhExecutor,
): Effect.Effect<CloudSession, CloudSessionFailedError> =>
  Effect.gen(function* () {
    // `null` means "we could not read the steps", which is NOT the same as
    // "there are no steps yet". Passing `[]` here would report `requested`
    // for a running session and march its phase backwards on one flaky poll.
    const steps: readonly WorkflowJobStep[] | null = isRunSettled(sessionRun)
      ? []
      : yield* run(jobStepsInvocation(repoRef, sessionRun.id)).pipe(
          Effect.map((result) =>
            result.stdoutTruncated ? null : parseJobStepsResponse(result.stdout),
          ),
          // Progress detail is a nicety: a run whose steps cannot be read is
          // still a real session, so degrade to the run-level phase rather
          // than failing the whole list.
          Effect.orElseSucceed((): readonly WorkflowJobStep[] | null => null),
        );
    const phase = deriveCloudSessionPhase(sessionRun, steps);
    return {
      sessionId: String(sessionRun.id),
      providerKind: "github_actions",
      phase,
      elapsedSeconds: cloudSessionElapsedSeconds(sessionRun, nowMs),
      // The workflow owns the hold duration, so the server does not invent a
      // remainder it cannot actually know.
      remainingSeconds: null,
      machineLabel,
      failureReason:
        phase === "failed"
          ? (sessionRun.conclusion ?? "The session stopped before it became reachable.")
          : null,
      detailsUrl: sessionRun.htmlUrl === "" ? null : sessionRun.htmlUrl,
    } satisfies CloudSession;
  });
