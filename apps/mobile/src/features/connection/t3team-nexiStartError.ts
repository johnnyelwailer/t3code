import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";
import { NexiSignInRequiredError } from "./t3team-nexiOAuth";

/**
 * What went wrong, reduced to the recovery the start screen offers:
 * `auth` re-signs in, `network` and `broker` retry, `host` refreshes the desktop list.
 */
export type NexiStartError = {
  readonly kind: "auth" | "network" | "broker" | "host" | "other";
  /** The broker's or the runtime's own text, shown verbatim. */
  readonly message: string;
  /** Set for `host`: the desktop that could not be reached. */
  readonly hostId?: string;
};

const FALLBACK = "Could not connect to Nexplore.";

export function classifyNexiStartError(
  cause: unknown,
  context: { readonly hostId?: string | undefined } = {},
): NexiStartError {
  const message = cause instanceof Error && cause.message.trim() ? cause.message : FALLBACK;
  if (cause instanceof NexiSignInRequiredError) return { kind: "auth", message };
  if (cause instanceof ConnectionBlockedError)
    return { kind: cause.reason === "authentication" ? "auth" : "other", message };
  if (cause instanceof ConnectionTransientError)
    return {
      kind: cause.reason === "network" || cause.reason === "timeout" ? "network" : "broker",
      message,
    };
  if (context.hostId) return { kind: "host", message, hostId: context.hostId };
  // fetch rejects with a TypeError when the device has no route to the broker.
  if (cause instanceof TypeError || (cause instanceof Error && cause.name === "TimeoutError"))
    return { kind: "network", message: "Could not reach the Nexi broker. Check your connection." };
  return { kind: "other", message };
}
