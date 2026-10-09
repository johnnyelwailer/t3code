/**
 * Connectivity failures of a request to another environment, marked at the source so the offline
 * outbox retries them instead of parking the send as failed. A server's own answer (a refusal, a
 * stale ask, a rejected credential) is never marked: that is permanent. Kept free of runtime
 * imports so the outbox classifier can depend on it.
 */
export class EnvironmentTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentTransientError";
  }
}

/** The environment has no prepared connection (between reconnects, or never paired). */
export class EnvironmentNotConnectedError extends EnvironmentTransientError {
  constructor() {
    super("Not connected to this environment.");
    this.name = "EnvironmentNotConnectedError";
  }
}

export const isEnvironmentTransientError = (error: unknown): error is EnvironmentTransientError =>
  error instanceof EnvironmentTransientError;

// The client runtime words a fetch-level failure this way (`failRemoteRequest` in rpc/http.ts);
// the same error class also reports credential problems, so the tag alone is not enough.
const FETCH_FAILURE_PREFIX = "Failed to fetch remote environment endpoint";

/** Map a client-runtime request failure to an Error, marking transport-level failures transient. */
export function toEnvironmentRequestError(cause: unknown): Error {
  const tag = (cause as { _tag?: unknown } | null)?._tag;
  const message = cause instanceof Error ? cause.message : String(cause);
  if (
    tag === "RemoteEnvironmentAuthTimeoutError" ||
    (tag === "RemoteEnvironmentAuthFetchError" && message.startsWith(FETCH_FAILURE_PREFIX))
  ) {
    return new EnvironmentTransientError(message);
  }
  return cause instanceof Error ? cause : new Error(message);
}
