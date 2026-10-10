/**
 * SQLite "unable to open database file" (SQLITE_CANTOPEN) often means the disk
 * is full and WAL/SHM sidecars cannot be created — not a missing path. Stop and
 * other writes then surface that raw string with no recovery hint.
 */

const STORAGE_EXHAUSTED_PATTERN =
  /unable to open database file|SQLITE_CANTOPEN|SQLITE_FULL|no space left|ENOSPC|disk(?:\s|_)?full|database (?:or disk is full|disk image is malformed)/i;

export const PERSISTENCE_STORAGE_EXHAUSTED_MESSAGE =
  "Can't update thread state — disk may be full (SQLite could not open or write the database, often when creating WAL files). Free disk space, then retry Stop or restart the app.";

function persistenceFailureText(cause: unknown): string {
  if (typeof cause === "string") return cause;
  if (cause instanceof Error) {
    const nested =
      "cause" in cause && cause.cause !== undefined ? persistenceFailureText(cause.cause) : "";
    return nested ? `${cause.message}\n${nested}` : cause.message;
  }
  if (cause !== null && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  try {
    return String(cause);
  } catch {
    return "";
  }
}

export function isPersistenceStorageExhausted(cause: unknown): boolean {
  return STORAGE_EXHAUSTED_PATTERN.test(persistenceFailureText(cause));
}

/** User-facing copy when a persistence write failed due to storage pressure. */
export function describePersistenceStorageExhausted(cause: unknown): string | undefined {
  return isPersistenceStorageExhausted(cause) ? PERSISTENCE_STORAGE_EXHAUSTED_MESSAGE : undefined;
}

/**
 * Prefer a clear storage-exhausted string as the defect so RPC/Cause pretty
 * prints show actionable text instead of the raw SQLite errno message.
 */
export function rewritePersistenceFailureCause(cause: unknown): unknown {
  return describePersistenceStorageExhausted(cause) ?? cause;
}
