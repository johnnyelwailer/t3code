/**
 * The composer's project is not on the machine a pending cloud setup is bound to. Recorded here as
 * a quiet suggestion rather than opened as the add-to-machine dialog: nothing modal may appear
 * without the user asking for it, and the machine is often not even reachable yet.
 *
 * Module-level, like the Run-on target it follows, so navigating threads does not drop it.
 */
import type { EnvironmentId, ScopedProjectRef } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

export interface CloudProjectCloneSuggestion {
  readonly scopeKey: string;
  readonly projectRef: ScopedProjectRef;
  readonly targetEnvironmentId: EnvironmentId;
}

const listeners = new Set<() => void>();
let byScope = new Map<string, CloudProjectCloneSuggestion>();
let snapshot: ReadonlyMap<string, CloudProjectCloneSuggestion> = byScope;

function commit(next: Map<string, CloudProjectCloneSuggestion>): void {
  byScope = next;
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ReadonlyMap<string, CloudProjectCloneSuggestion> {
  return snapshot;
}

function same(a: CloudProjectCloneSuggestion, b: CloudProjectCloneSuggestion): boolean {
  return (
    a.targetEnvironmentId === b.targetEnvironmentId &&
    a.projectRef.environmentId === b.projectRef.environmentId &&
    a.projectRef.projectId === b.projectRef.projectId
  );
}

export function suggestCloudProjectClone(suggestion: CloudProjectCloneSuggestion): void {
  const current = byScope.get(suggestion.scopeKey);
  if (current !== undefined && same(current, suggestion)) return;
  const next = new Map(byScope);
  next.set(suggestion.scopeKey, suggestion);
  commit(next);
}

export function clearCloudProjectCloneSuggestion(scopeKey: string): void {
  if (!byScope.has(scopeKey)) return;
  const next = new Map(byScope);
  next.delete(scopeKey);
  commit(next);
}

export function useCloudProjectCloneSuggestion(
  scopeKey: string | null,
): CloudProjectCloneSuggestion | null {
  const suggestions = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return scopeKey === null ? null : (suggestions.get(scopeKey) ?? null);
}
