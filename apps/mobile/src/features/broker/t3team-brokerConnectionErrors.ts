import {
  type ConnectionAttemptError,
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";
import type { CloudSessionFailedError } from "@t3tools/contracts";

/**
 * Broker failures in the connection layer's terms. A sign-in the broker needs blocks the
 * connection as an authentication problem — the environment row then points at "Sign in with
 * Microsoft" — and everything else is retried by the connection supervisor.
 */
export const brokerConnectionError = (error: CloudSessionFailedError): ConnectionAttemptError =>
  error.reason === "broker_sign_in_required"
    ? new ConnectionBlockedError({ reason: "authentication", detail: error.message })
    : new ConnectionTransientError({ reason: "remote-unavailable", detail: error.message });

export const noBrokerConfigured = new ConnectionBlockedError({
  reason: "unsupported",
  detail: "This build has no Nexi broker configured.",
});

/** The proxy answered 404: the device is gone, or this broker does not proxy for phones yet. */
export const deviceUnreachableFromPhone = new ConnectionBlockedError({
  reason: "unsupported",
  detail:
    "The Nexi broker cannot open this machine from a phone: it has gone, or phone access is not switched on for the broker yet.",
});

export const deviceSignInRejected = new ConnectionBlockedError({
  reason: "authentication",
  detail: "Your Microsoft sign-in was not accepted. Sign in again.",
});

export const deviceOffline = (label: string) =>
  new ConnectionTransientError({ reason: "remote-unavailable", detail: `${label} is offline.` });

export const sessionNotRunning = new ConnectionTransientError({
  reason: "remote-unavailable",
  detail: "That cloud session is not running: it is still starting, or it has ended.",
});

export const sessionMovedEnvironment = new ConnectionBlockedError({
  reason: "configuration",
  detail:
    "The cloud session now runs a different environment. Open it again from Machines in Settings.",
});
