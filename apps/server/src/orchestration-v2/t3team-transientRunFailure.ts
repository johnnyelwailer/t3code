/**
 * Which failed V2 runs count as TRANSIENT (worth re-running as they were):
 * gateway capacity/rate/5xx errors (423, 429, 502–504, retry directives),
 * transport failures such as the host turn-inactivity watchdog, and any
 * failure the provider itself marked `retryable`.
 *
 * Two consumers share this one rule so they cannot drift:
 * - `Orchestrator.ts` accepts `message.dispatch{manualContinuationOfRunId}`
 *   of such a failed run (upstream accepts only interrupted runs and usage
 *   limits) — the manual-continuation eligibility hook;
 * - the fork's session-level transient retry
 *   (`t3team-threadTransientTurnRetryReactor.ts`) re-runs it automatically.
 *
 * Never transient: usage limits (upstream limit recovery owns them),
 * permission/validation errors, and a Stop the provider never acknowledged
 * (`interrupt_no_terminal`) — re-running that would undo the user's stop.
 */
import type { OrchestrationV2ProviderFailure } from "@t3tools/contracts";

import {
  isTransientGatewayErrorText,
  retryDirectiveSeconds,
} from "../provider/Layers/t3team-claude-gateway-retry.ts";

const NEVER_TRANSIENT_CODES: ReadonlySet<string> = new Set(["interrupt_no_terminal"]);

export interface TransientRunFailure {
  /** The provider's failure text (raw; callers format it for display). */
  readonly message: string;
  /** Gateway `retry_after_seconds` / `Retry-After`, when the text carries one. */
  readonly directiveSeconds: number | null;
}

export const classifyTransientRunFailure = (
  failure: OrchestrationV2ProviderFailure | null | undefined,
): TransientRunFailure | null => {
  if (failure == null) return null;
  if (
    failure.class === "usage_limit" ||
    failure.class === "permission_error" ||
    failure.class === "validation_error"
  ) {
    return null;
  }
  if (failure.code !== null && NEVER_TRANSIENT_CODES.has(failure.code)) return null;
  const transient =
    failure.retryable === true ||
    failure.class === "transport_error" ||
    isTransientGatewayErrorText(failure.message);
  return transient
    ? { message: failure.message, directiveSeconds: retryDirectiveSeconds(failure.message) }
    : null;
};
