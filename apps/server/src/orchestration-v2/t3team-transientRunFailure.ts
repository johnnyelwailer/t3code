/**
 * Which failed V2 runs count as TRANSIENT (worth re-running as they were):
 * gateway capacity/rate/5xx errors (423, 429, 502–504, retry directives),
 * transport failures such as the host turn-inactivity watchdog, network
 * outages (`t3team-networkOutageFailure.ts`), and any
 * failure the provider itself marked `retryable`.
 *
 * The fork's session-level transient retry
 * (`t3team-threadTransientTurnRetryReactor.ts`) re-runs such a run
 * automatically. A manual one-click continuation accepts every failed run, not
 * only transient ones (`@t3tools/shared/t3team-manualContinuation`).
 *
 * Never transient: usage limits (upstream limit recovery owns them),
 * permission/validation errors, and a Stop the provider never acknowledged
 * (`interrupt_no_terminal`, on runs settled before the Stop backstop recorded
 * such a Stop as `interrupted`) — re-running that would undo the user's stop.
 */
import type { OrchestrationV2ProviderFailure } from "@t3tools/contracts";

import { isNetworkOutageFailure } from "./t3team-networkOutageFailure.ts";
import {
  isTransientGatewayErrorText,
  retryDirectiveSeconds,
} from "../provider/t3team-claude-gateway-retry.ts";

const NEVER_TRANSIENT_CODES: ReadonlySet<string> = new Set(["interrupt_no_terminal"]);

export interface TransientRunFailure {
  /** The provider's failure text (raw; callers format it for display). */
  readonly message: string;
  /** Gateway `retry_after_seconds` / `Retry-After`, when the text carries one. */
  readonly directiveSeconds: number | null;
  /** A network outage (can last minutes): the session retry gives it the longer budget. */
  readonly outage: boolean;
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
  const outage = isNetworkOutageFailure(failure);
  const transient =
    failure.retryable === true ||
    failure.class === "transport_error" ||
    outage ||
    isTransientGatewayErrorText(failure.message);
  return transient
    ? {
        message: failure.message,
        directiveSeconds: retryDirectiveSeconds(failure.message),
        outage,
      }
    : null;
};
