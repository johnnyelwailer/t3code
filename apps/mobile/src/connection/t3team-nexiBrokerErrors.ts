import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";

const MAX_DETAIL = 200;

/** The broker's `{ error }` text, bounded and stripped of control characters; never raw bodies. */
export async function brokerErrorText(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const error =
      typeof body === "object" && body !== null ? (body as { error?: unknown }).error : null;
    if (typeof error !== "string") return null;
    const text = [...error]
      .map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? " " : char))
      .join("")
      .trim()
      .slice(0, MAX_DETAIL);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Definitive statuses park the connection (blocked): retrying the same request cannot succeed.
 * Everything else the broker or network can say is transient and retried on the supervisor's
 * backoff. 502/503/504 are transient on purpose: the broker answers them while a host is
 * (re)connecting, and each retry mints a fresh pairing token.
 */
export function classifyBrokerFailure(status: number, text: string | null, sessionScoped: boolean) {
  const detail = (fallback: string) => text ?? fallback;
  if (status === 401 || status === 403)
    return new ConnectionBlockedError({
      reason: "authentication",
      detail: detail("The broker refused access. Sign in with the account that owns this host."),
      httpStatus: status,
    });
  // On the host list a 404 means the broker has no host support yet (a deploy gap), which heals.
  if (status === 400 || status === 410 || (status === 404 && sessionScoped))
    return new ConnectionBlockedError({
      reason: "configuration",
      detail: detail(`The broker rejected this request (HTTP ${status}).`),
      httpStatus: status,
    });
  return new ConnectionTransientError({
    reason: "remote-unavailable",
    detail: detail(
      `The broker is unavailable (HTTP ${status}). Check host enrollment and broker host support.`,
    ),
    httpStatus: status,
  });
}

/** A fetch that never produced a response: offline, DNS, TLS, or the 30 second timeout. */
export function classifyBrokerNetworkFailure(error: unknown) {
  const timeout = error instanceof Error && error.name === "TimeoutError";
  return new ConnectionTransientError({
    reason: timeout ? "timeout" : "network",
    detail: timeout ? "The broker did not answer in time." : "The broker could not be reached.",
  });
}
