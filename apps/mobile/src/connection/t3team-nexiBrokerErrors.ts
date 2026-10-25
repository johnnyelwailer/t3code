import {
  ConnectionBlockedError,
  ConnectionTransientError,
  sessionEndedError,
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
 *
 * 404 depends on what was asked for. The broker deletes a host's session record when the host goes
 * down (`host.down`), so for an `h-*` session it means "offline or reconnecting", which heals; for a
 * cloud session it means the session is gone, the existing "ended" state. On the host list it means
 * the broker has no host support yet (a deploy gap), which also heals.
 * `sessionId` is null for calls that are not about one session.
 */
export function classifyBrokerFailure(
  status: number,
  text: string | null,
  sessionId: string | null,
) {
  const detail = (fallback: string) => text ?? fallback;
  if (status === 401 || status === 403)
    return new ConnectionBlockedError({
      reason: "authentication",
      detail: detail("The broker refused access. Sign in with the account that owns this host."),
      httpStatus: status,
    });
  if (status === 404 && sessionId !== null && !sessionId.startsWith("h-"))
    return sessionEndedError(detail("That cloud session has ended."));
  if (status === 400 || status === 410)
    return new ConnectionBlockedError({
      reason: "configuration",
      detail: detail(`The broker rejected this request (HTTP ${status}).`),
      httpStatus: status,
    });
  if (status === 404 && sessionId?.startsWith("h-"))
    return new ConnectionTransientError({
      reason: "remote-unavailable",
      detail: "That desktop host is offline or reconnecting. Retrying when it is back.",
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
