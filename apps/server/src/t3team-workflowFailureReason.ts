/**
 * Turn a thrown workflow error into something an AGENT can act on.
 *
 * A raw error is the wrong thing to hand back over `t3team.orchestration.status` / `_resume`:
 * it carries stack frames, absolute host paths and internal ids that are noise at best and a
 * leak at worst. This module produces the two agent-facing strings persisted at settle time
 * (migration 044) and echoed by both tools:
 *
 *   • {@link workflowFailureReasonText} — one readable line: the error's own message, stack
 *     frames dropped, absolute paths reduced to a basename, whitespace collapsed, length capped.
 *   • {@link workflowFailureStepText}   — WHERE it broke: the settle phase (`launch`, `resume`,
 *     `rehydration`, `scheduler-wake`) plus the primitive that was in flight, when known.
 *   • {@link userFacingFailureStep}     — the same string with the leading phase token stripped,
 *     for surfaces a human reads directly (GHE #344): `resume` is our internal settle-phase name,
 *     not something a user asked about ever means.
 */

/** Which funnel settled the failure — the coarse "phase" half of the failing-step label. */
export type WorkflowFailurePhase = "launch" | "resume" | "rehydration" | "scheduler-wake";

const PHASE_PREFIX = /^(?:launch|resume|rehydration|scheduler-wake):\s*/;

/** Strip the leading internal settle-phase token from a `failure_step` string before showing it
 * to a user (e.g. `resume: thread.turn (QA round 1)` → `thread.turn (QA round 1)`). The raw value
 * — phase prefix included — stays in the DB row and in agent-facing surfaces (`t3team.orchestration
 * .status` / `_resume`), which need the phase to reason about where a run parked. A string with no
 * phase prefix passes through unchanged. */
export function userFacingFailureStep(step: string): string {
  return step.replace(PHASE_PREFIX, "");
}

const MAX_REASON_LENGTH = 240;

/** Everything from the first stack frame on is machine detail, not a reason. */
const STACK_FRAME = /\n\s*at\s.+/s;
/** Absolute posix/UNC/windows paths — reduced to their basename so no host layout leaks. */
const ABSOLUTE_PATH = /(?:[A-Za-z]:)?(?:\/|\\\\)[^\s'"()]*[/\\]([^\s'"()/\\]+)/g;

/** One readable line describing why the run failed. Never a stack trace, never a host path. */
export function workflowFailureReasonText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutStack = raw.replace(STACK_FRAME, "");
  const withoutPaths = withoutStack.replaceAll(ABSOLUTE_PATH, (_match, base: string) => base);
  const oneLine = withoutPaths.replaceAll(/\s+/g, " ").trim();
  if (oneLine.length === 0) return "The run failed without reporting a reason.";
  return oneLine.length <= MAX_REASON_LENGTH
    ? oneLine
    : `${oneLine.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

/**
 * The failing step label: the settle phase, plus the primitive in flight when the emitter still
 * remembers one (a rehydrated run's emitter has no memory of the pre-restart step, so the phase
 * alone is the honest answer — better than inventing a step).
 */
export function workflowFailureStepText(
  phase: WorkflowFailurePhase,
  pendingStep: string | undefined,
): string {
  const step = pendingStep?.replaceAll(/\s+/g, " ").trim() ?? "";
  return step.length === 0 ? phase : `${phase}: ${step}`;
}
