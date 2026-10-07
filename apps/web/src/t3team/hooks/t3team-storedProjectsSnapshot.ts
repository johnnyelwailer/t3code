/**
 * The page's current stored project list, published whenever it is written.
 *
 * Every surface that needs the project list used to derive it on its own: the project store from
 * its own `useState`, the startup gate from its own `hydrateStoredProjects()` call. Two derivations
 * of one list means two scopes for the My Work digest — and the digest caches per scope signature,
 * so the gate's probe and the view's first paint missed each other's cache.
 *
 * A leaf module on purpose: both the persistence layer (which hydrates and writes) and the React
 * hooks (which read) depend on it, and neither may depend on the other.
 */
import type { ProjectShellProject } from "@t3tools/project-context";

let snapshot: ReadonlyArray<ProjectShellProject> | null = null;
const listeners = new Set<() => void>();

/** `null` until the list has been hydrated or written once — "not known yet", never "none". */
export function readStoredProjectsSnapshot(): ReadonlyArray<ProjectShellProject> | null {
  return snapshot;
}

export function publishStoredProjectsSnapshot(projects: ReadonlyArray<ProjectShellProject>): void {
  if (snapshot === projects) return;
  snapshot = projects;
  // Deleting from a Set mid-iteration is safe in JS, so an unsubscribing listener is fine here.
  for (const listener of listeners) listener();
}

export function subscribeStoredProjectsSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: a fresh page. */
export function resetStoredProjectsSnapshotForTests(): void {
  snapshot = null;
  listeners.clear();
}
