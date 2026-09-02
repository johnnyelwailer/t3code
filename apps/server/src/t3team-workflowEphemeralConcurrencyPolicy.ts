/**
 * Conservative core default for `maxActiveSteps` (the admission queue's concurrently-admitted
 * step permits, see `t3team-workflowAdmissionQueue.ts`); distributions may override this through
 * pack activation, and an operator CLI flag/env var (`cli/config.ts`,
 * `resolveEphemeralWorkflowMaxActiveStepsOverride`) may override both.
 *
 * Deliberately distinct from `DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS` below, which seeds
 * `maxLiveRuns` — the *count* of live ephemeral runs, PER LAUNCHING THREAD
 * (`t3team-toolBrokerWorkflowRunTools.ts`) — rather than concurrently-admitted steps. Two
 * different limits that happen to share the same numeric value today.
 */
export const DEFAULT_EPHEMERAL_WORKFLOW_MAX_ACTIVE_STEPS = 8;

/**
 * Conservative core default for `maxLiveRuns` — the same CLI flag → env var → pack policy → core
 * default precedence as `maxActiveSteps`, via `resolveEphemeralWorkflowMaxLiveRunsOverride`
 * (`cli/config.ts`). This is only the SEED value the policy singleton starts with; the cap
 * actually enforced at launch time is whatever `getWorkflowEphemeralConcurrencyPolicy().maxLiveRuns`
 * currently holds (`t3team-toolBrokerWorkflowRunTools.ts`), which any of those sources may have
 * since changed. Do not assign this to `maxActiveSteps` — that was Problem 2.
 */
export const DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS = 8;

export type WorkflowEphemeralConcurrencyPolicy = {
  readonly maxActiveSteps: number | "unlimited";
  /** Max ephemeral runs holding engine resources (running/suspended/sleeping/paused) per
   * launching thread, at once (spec D8) — see `T3TEAM_EPHEMERAL_RUN_CAP`'s doc comment for why
   * this is scoped per-thread rather than server-wide. */
  readonly maxLiveRuns: number | "unlimited";
};

let policy: WorkflowEphemeralConcurrencyPolicy = {
  maxActiveSteps: DEFAULT_EPHEMERAL_WORKFLOW_MAX_ACTIVE_STEPS,
  maxLiveRuns: DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS,
};

/**
 * Merges into the current policy rather than replacing it wholesale, so a caller that only sets
 * ONE field (a pack that only cares about step concurrency, or an operator override that only
 * touches one flag) never silently resets the other back to its default. Every existing caller
 * already passes a subset-shaped object (`{ maxActiveSteps: N }`), so this is behavior-preserving
 * for them; it only starts to matter now that there are two independently-settable fields.
 */
export const setWorkflowEphemeralConcurrencyPolicy = (
  next: Partial<WorkflowEphemeralConcurrencyPolicy>,
): void => {
  policy = { ...policy, ...next };
};

export const getWorkflowEphemeralConcurrencyPolicy = (): WorkflowEphemeralConcurrencyPolicy =>
  policy;
