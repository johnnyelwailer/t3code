/**
 * What one Install/Connect click actually produced. A refusal decided before anything spawns (the
 * `INTEGRATIONS_TOOL_AUTH` gate) comes back as a SUCCESS value carrying `phase: "failed"`, so a
 * caller reading only the error channel drops it and the button looks dead.
 * @module state/toolauthActionOutcome
 */
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { ToolAuthState } from "@t3tools/contracts";

import {
  toolAuthFailureReasonFromError,
  toolAuthFailureReasonFromState,
} from "./t3team-toolAuthFailureFromError";
import type { ToolAuthFailureKind } from "./t3team-toolAuthFailureMessage";

export type ToolAuthActionOutcome =
  /** The machine accepted it and a flow is running. */
  | { readonly kind: "started"; readonly state: ToolAuthState }
  /** It ended, by either channel. `error` is the squashed cause, for logging only. */
  | { readonly kind: "failed"; readonly reason: ToolAuthFailureKind; readonly error?: unknown }
  /** Superseded by a newer command on the same lane — not a user-visible failure. */
  | { readonly kind: "interrupted" };

export function toolAuthActionOutcome(
  result: AtomCommandResult<ToolAuthState, unknown>,
): ToolAuthActionOutcome {
  if (result._tag === "Failure") {
    if (isAtomCommandInterrupted(result)) return { kind: "interrupted" };
    const error = squashAtomCommandFailure(result);
    return { kind: "failed", reason: toolAuthFailureReasonFromError(error), error };
  }
  const reason = toolAuthFailureReasonFromState(result.value);
  return reason === null ? { kind: "started", state: result.value } : { kind: "failed", reason };
}
