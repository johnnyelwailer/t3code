import * as Schema from "effect/Schema";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";

/**
 * Write-through persistence for kickoff ("start a new thread") composer text.
 *
 * The kickoff composer has no thread or draft-thread yet, so it is not part of
 * `composerDraftStore`. Its text used to live only in React state and was lost
 * on every reload, crash or forced restart. Each change is written straight to
 * localStorage (no debounce: the payload is tiny), keyed by a stable surface key
 * such as `project:<projectId>` or `ticket:<projectId>:<ticketId>`.
 */
export const KICKOFF_COMPOSER_DRAFT_STORAGE_KEY = "t3team:kickoff-composer-drafts:v1";

/** Keep the store small: only the most recent drafts survive, and stale ones expire. */
export const KICKOFF_COMPOSER_DRAFT_MAX_ENTRIES = 50;
export const KICKOFF_COMPOSER_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const KickoffComposerDraftEntry = Schema.Struct({
  text: Schema.String,
  updatedAt: Schema.Number,
});
const KickoffComposerDraftMap = Schema.Record(Schema.String, KickoffComposerDraftEntry);
type KickoffComposerDraftMap = typeof KickoffComposerDraftMap.Type;

function readAll(): KickoffComposerDraftMap {
  try {
    return getLocalStorageItem(KICKOFF_COMPOSER_DRAFT_STORAGE_KEY, KickoffComposerDraftMap) ?? {};
  } catch {
    return {};
  }
}

/** Drops expired entries and keeps the newest `maxEntries`. Pure, exported for tests. */
export function pruneKickoffComposerDrafts(
  drafts: KickoffComposerDraftMap,
  now: number,
  maxEntries: number = KICKOFF_COMPOSER_DRAFT_MAX_ENTRIES,
): KickoffComposerDraftMap {
  const fresh = Object.entries(drafts)
    .filter(([, entry]) => entry.text.length > 0)
    .filter(([, entry]) => now - entry.updatedAt <= KICKOFF_COMPOSER_DRAFT_MAX_AGE_MS)
    .toSorted(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .slice(0, maxEntries);
  return Object.fromEntries(fresh);
}

export function readKickoffComposerDraft(draftKey: string | null): string | null {
  if (!draftKey) return null;
  const entry = readAll()[draftKey];
  return entry && entry.text.length > 0 ? entry.text : null;
}

/** Saves `text` for `draftKey` immediately; empty text removes the entry. */
export function writeKickoffComposerDraft(
  draftKey: string | null,
  text: string,
  now: number = Date.now(),
): void {
  if (!draftKey) return;
  const current = readAll();
  if (text.length === 0 && !(draftKey in current)) return;
  if (current[draftKey]?.text === text) return;
  const next: Record<string, typeof KickoffComposerDraftEntry.Type> = { ...current };
  if (text.length === 0) {
    delete next[draftKey];
  } else {
    next[draftKey] = { text, updatedAt: now };
  }
  try {
    setLocalStorageItem(
      KICKOFF_COMPOSER_DRAFT_STORAGE_KEY,
      pruneKickoffComposerDrafts(next, now),
      KickoffComposerDraftMap,
    );
  } catch (error) {
    console.warn("[t3team] Could not save kickoff composer draft.", error);
  }
}

/** Stable per-surface key: a ticket's own draft, else the project's (or the all-projects) draft. */
export function resolveKickoffComposerDraftKey(input: {
  readonly draftKey?: string | undefined;
  readonly projectId?: string | undefined;
}): string {
  if (input.draftKey && input.draftKey.length > 0) return input.draftKey;
  return input.projectId ? `project:${input.projectId}` : "project:all";
}
