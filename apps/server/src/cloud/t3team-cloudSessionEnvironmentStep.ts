import type { WorkflowJobStep } from "./t3team-githubActionsSessionClient.ts";

/**
 * Reading the relay environment id a session's machine linked under, from the
 * job steps the projection already fetches for every in-progress run.
 *
 * The id is minted on the VM when its server first starts, so the creator's
 * server never sees the link handshake. `session.yml` therefore publishes it as
 * the *name* of a marker step (`Relay environment <id>`, rendered from an env
 * var the readiness step sets), which costs no GHE call beyond the steps read
 * the phase derivation already makes.
 */

/** The marker step's name prefix; `session.yml` must match it byte for byte. */
export const ENVIRONMENT_STEP_PREFIX = "Relay environment ";

/**
 * A plausible environment id: the VM mints UUIDs. Strict on purpose — a step
 * that has not started yet may surface its unrendered template (`${{ … }}`) or
 * an empty expansion, and neither may ever reach a client as a connect target.
 */
const ENVIRONMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

/** Only a step GitHub has actually started carries a rendered name. */
const hasStarted = (step: WorkflowJobStep): boolean =>
  step.status === "in_progress" || step.status === "completed";

/**
 * The environment id published by the marker step, or `undefined` when the
 * steps are unreadable, the marker has not run yet, or the workflow predates it
 * — the client then falls back to correlating through relay discovery.
 */
export function environmentIdFromSteps(
  steps: readonly WorkflowJobStep[] | null,
): string | undefined {
  if (steps === null) return undefined;
  for (const step of steps) {
    if (!hasStarted(step) || !step.name.startsWith(ENVIRONMENT_STEP_PREFIX)) continue;
    const candidate = step.name.slice(ENVIRONMENT_STEP_PREFIX.length).trim();
    if (ENVIRONMENT_ID_PATTERN.test(candidate)) return candidate;
  }
  return undefined;
}
