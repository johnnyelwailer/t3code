/**
 * Duplicate-`thread.create` detection for the thread-bootstrap recovery path.
 *
 * The value that reaches the bootstrap `catch` is NOT a plain `Error`: the atom-command layer
 * rejects with an Effect `Cause` envelope whose leaf carries the orchestration invariant message,
 * e.g.
 *
 * ```json
 * { "_id": "Cause", "failures": [{ "_tag": "Fail",
 *   "error": { "_tag": "OrchestrationDispatchCommandError", "message": "…already exists…" } }] }
 * ```
 *
 * A detector that only reads `error.message` on `instanceof Error` therefore never matched, the
 * duplicate was rethrown, and the whole kickoff sequence aborted before the recipe launch — which
 * is what masked the real double-dispatch defect. Unwrap the tagged-failure shapes as well as
 * plain errors and strings.
 */

const DUPLICATE_THREAD_CREATE_ERROR_FRAGMENT = "already exists and cannot be created twice.";

const MAX_UNWRAP_DEPTH = 6;

function collectErrorMessages(value: unknown, depth: number, messages: string[]): void {
  if (depth > MAX_UNWRAP_DEPTH || value == null) {
    return;
  }

  if (typeof value === "string") {
    messages.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectErrorMessages(entry, depth + 1, messages);
    }
    return;
  }

  if (value instanceof Error) {
    messages.push(value.message);
    collectErrorMessages((value as { cause?: unknown }).cause, depth + 1, messages);
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  // Effect `Cause` / tagged-failure envelopes: the message lives under `failures[].error.message`,
  // `cause`, `error`, or `defect` depending on how the failure was wrapped.
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") {
    messages.push(record.message);
  }
  for (const key of ["failures", "error", "cause", "defect", "failure"] as const) {
    if (key in record) {
      collectErrorMessages(record[key], depth + 1, messages);
    }
  }
}

/** True when `error` (in any wrapper shape) reports a `thread.create` duplicate-thread invariant. */
export function isDuplicateThreadCreateError(error: unknown): boolean {
  const messages: string[] = [];
  collectErrorMessages(error, 0, messages);

  return messages.some((message) => message.includes(DUPLICATE_THREAD_CREATE_ERROR_FRAGMENT));
}
