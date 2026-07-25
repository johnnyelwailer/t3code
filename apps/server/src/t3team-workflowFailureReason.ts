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
 */

/** Which funnel settled the failure — the coarse "phase" half of the failing-step label. */
export type WorkflowFailurePhase = "launch" | "resume" | "rehydration" | "scheduler-wake";

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
