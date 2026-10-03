/**
 * Pure patch semantics for fork thread facts (`T3TeamThreadFacts`).
 *
 * A patch names only the facts its writer owns; absent keys keep their stored
 * value, `null` clears a nullable fact. `activityLabel` and `childStatus` stamp
 * their `*UpdatedAt` companion only when their value actually changes.
 * `extensions` merges per key and a `null` value deletes that key.
 */
import type {
  OrchestrationWorkflowRunStatus,
  T3TeamThreadFacts,
  T3TeamThreadRetention,
  ThreadEnvironmentBinding,
  ThreadId,
} from "@t3tools/contracts";

export interface T3TeamThreadFactsPatch {
  readonly workflowRunStatus?: OrchestrationWorkflowRunStatus | null;
  readonly sleepingUntil?: string | null;
  readonly activityLabel?: string | null;
  readonly childStatus?: string | null;
  readonly environment?: ThreadEnvironmentBinding | null;
  readonly retention?: T3TeamThreadRetention | null;
  readonly resourcePressurePaused?: boolean;
  /** Merged per key; a `null` value removes the key. */
  readonly extensions?: Readonly<Record<string, unknown>>;
}

type MutableFacts = { -readonly [K in keyof T3TeamThreadFacts]: T3TeamThreadFacts[K] };

const PLAIN_KEYS = [
  "workflowRunStatus",
  "sleepingUntil",
  "environment",
  "retention",
  "resourcePressurePaused",
] as const;

const STAMPED_KEYS = [
  ["activityLabel", "activityLabelUpdatedAt"],
  ["childStatus", "childStatusUpdatedAt"],
] as const;

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/**
 * Applies `patch` over `current` (or an empty record). Returns `null` when the
 * patch changes nothing, so callers skip the write and the change event.
 */
export function mergeThreadFacts(
  threadId: ThreadId,
  current: T3TeamThreadFacts | null,
  patch: T3TeamThreadFactsPatch,
  nowIso: string,
): T3TeamThreadFacts | null {
  const next: MutableFacts = current === null ? { threadId, updatedAt: nowIso } : { ...current };
  let changed = current === null;
  for (const key of PLAIN_KEYS) {
    const value = patch[key];
    if (value === undefined || sameJson(next[key], value)) continue;
    Object.assign(next, { [key]: value });
    changed = true;
  }
  for (const [key, stampKey] of STAMPED_KEYS) {
    const value = patch[key];
    if (value === undefined || sameJson(next[key], value)) continue;
    Object.assign(next, { [key]: value, [stampKey]: nowIso });
    changed = true;
  }
  if (patch.extensions !== undefined) {
    const extensions: Record<string, unknown> = { ...next.extensions };
    for (const [key, value] of Object.entries(patch.extensions)) {
      if (value === null) {
        if (key in extensions) {
          delete extensions[key];
          changed = true;
        }
      } else if (!sameJson(extensions[key], value)) {
        extensions[key] = value;
        changed = true;
      }
    }
    if (Object.keys(extensions).length === 0) delete next.extensions;
    else next.extensions = extensions;
  }
  if (!changed) return null;
  next.updatedAt = nowIso;
  return next;
}
