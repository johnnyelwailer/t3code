import type { CloudSession, CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

import type * as VcsProcess from "../vcs/VcsProcess.ts";
import {
  cloudSessionDurationSeconds,
  cloudSessionElapsedSeconds,
  deriveCloudSessionPhase,
} from "./t3team-cloudSessionPhase.ts";
import { environmentIdFromSteps } from "./t3team-cloudSessionEnvironmentStep.ts";
import {
  cachedFailureReason,
  cloudSessionFailureReason,
  type FailureReasonCache,
  recordFailureRead,
} from "./t3team-cloudSessionFailureReason.ts";
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

/** `session.yml` appends this to `run-name` in broker mode; the run list shows nothing else of it. */
const BROKER_RUN_NAME_MARKER = "· broker";

/**
 * Project one provisioning run into the `CloudSession` the client renders.
 */
export const projectCloudSession = (
  sessionRun: WorkflowRunSummary,
  nowMs: number,
  machineLabel: string,
  repoRef: CloudSessionRepoRef,
  run: GhExecutor,
  failureReasons?: FailureReasonCache,
): Effect.Effect<CloudSession, CloudSessionFailedError> =>
  Effect.gen(function* () {
    // `null` means "we could not read the steps", which is NOT the same as
    // "there are no steps yet". Passing `[]` here would report `requested`
    // for a running session and march its phase backwards on one flaky poll.
    const readSteps = run(jobStepsInvocation(repoRef, sessionRun.id)).pipe(
      Effect.map((result) =>
        result.stdoutTruncated ? null : parseJobStepsResponse(result.stdout),
      ),
      // Progress detail is a nicety: a run whose steps cannot be read is
      // still a real session, so degrade to the run-level phase rather
      // than failing the whole list.
      Effect.orElseSucceed((): readonly WorkflowJobStep[] | null => null),
    );
    const steps: readonly WorkflowJobStep[] | null = isRunSettled(sessionRun)
      ? []
      : yield* readSteps;
    const phase = deriveCloudSessionPhase(sessionRun, steps);
    const failureReason =
      phase === "failed"
        ? yield* settledFailureReason(sessionRun, readSteps, failureReasons)
        : null;
    // The relay environment id is minted on the session's machine, which
    // publishes it as a marker step name; pin it only on `ready` (the contract
    // allows it nowhere else). A workflow that predates the marker leaves it
    // `undefined`, and the client then correlates from the relay instead.
    const environmentId = phase === "ready" ? environmentIdFromSteps(steps) : undefined;
    const settled = sessionRun.status === "completed";
    return {
      sessionId: String(sessionRun.id),
      providerKind: "github_actions",
      phase,
      elapsedSeconds: cloudSessionElapsedSeconds(sessionRun, nowMs),
      // The workflow owns the hold duration, so the server does not invent a
      // remainder it cannot actually know.
      remainingSeconds: null,
      machineLabel,
      failureReason,
      detailsUrl: sessionRun.htmlUrl === "" ? null : sessionRun.htmlUrl,
      ...(environmentId !== undefined ? { environmentId } : {}),
      transport: sessionRun.name.includes(BROKER_RUN_NAME_MARKER) ? "nexi_broker" : "t3_connect",
      // Only a settled run has a real "how long did it run" figure; a live
      // session would be reporting its age, not its duration.
      ...(settled ? { durationSeconds: cloudSessionDurationSeconds(sessionRun) } : {}),
    } satisfies CloudSession;
  });

/**
 * A failed run is settled, so its steps are final: read them once to name the
 * step that broke, then serve the cached reason on every later list.
 */
const settledFailureReason = (
  sessionRun: WorkflowRunSummary,
  readSteps: Effect.Effect<readonly WorkflowJobStep[] | null>,
  cache: FailureReasonCache | undefined,
): Effect.Effect<string> => {
  const cached = cachedFailureReason(cache, sessionRun.id);
  if (cached !== undefined) return Effect.succeed(cached);
  return Effect.map(readSteps, (steps) => {
    const reason = cloudSessionFailureReason(sessionRun, steps);
    recordFailureRead(cache, sessionRun.id, reason, steps !== null);
    return reason;
  });
};
