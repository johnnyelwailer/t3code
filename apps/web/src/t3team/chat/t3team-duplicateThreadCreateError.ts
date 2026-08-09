/**
 * Duplicate-invariant detection for orchestration command dispatches (`thread.create`,
 * `project.create` / `project.meta.update`).
 *
 * The value that reaches a dispatch `catch` is NOT a plain `Error`: the atom-command layer rejects
 * with an Effect `Cause` envelope whose leaf carries the orchestration invariant message, e.g.
 *
 * ```json
 * { "_id": "Cause", "failures": [{ "_tag": "Fail",
 *   "error": { "_tag": "OrchestrationDispatchCommandError", "message": "…already exists…" } }] }
 * ```
 *
 * A detector that only reads `error.message` on `instanceof Error` therefore never matched, the
 * duplicate was rethrown, and the whole kickoff sequence aborted before the recipe launch — which
 * is what masked the real double-dispatch defect. `collectErrorMessages` unwraps the tagged-failure
 * shapes as well as plain errors and strings; every detector below reuses it rather than re-walking
 * the Cause shape.
 */

const DUPLICATE_THREAD_CREATE_ERROR_FRAGMENT = "already exists and cannot be created twice.";

// `project.create`/`project.meta.update` invariants: a work-source binding already claimed by
// another active project (`requireProjectSourceBindingUnclaimed`), or a workspace root already
// backing another active project (`requireActiveProjectWorkspaceRootAbsent`). Both mean "this
// project already exists" from the wizard's point of view.
const DUPLICATE_PROJECT_BINDING_ERROR_FRAGMENTS = [
  "already bound to project",
  "already exists for workspace root",
];

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

/** True when `error` (in any wrapper shape) contains a message matching one of `fragments`. */
function causeIncludesFragment(error: unknown, fragments: readonly string[]): boolean {
  const messages: string[] = [];
  collectErrorMessages(error, 0, messages);

  return messages.some((message) => fragments.some((fragment) => message.includes(fragment)));
}

/** True when `error` (in any wrapper shape) reports a `thread.create` duplicate-thread invariant. */
export function isDuplicateThreadCreateError(error: unknown): boolean {
  return causeIncludesFragment(error, [DUPLICATE_THREAD_CREATE_ERROR_FRAGMENT]);
}

/**
 * True when `error` (in any wrapper shape) reports a `project.create` / `project.meta.update`
 * invariant that means "this project already exists" — a claimed work-source binding or a
 * workspace root already backing another active project.
 */
export function isDuplicateProjectBindingError(error: unknown): boolean {
  return causeIncludesFragment(error, DUPLICATE_PROJECT_BINDING_ERROR_FRAGMENTS);
}
