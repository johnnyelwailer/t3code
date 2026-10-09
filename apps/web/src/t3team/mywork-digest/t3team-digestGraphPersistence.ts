/**
 * The last digest graphs, kept across page loads in localStorage.
 *
 * The in-memory cache only ever spared a REMOUNT its round trip; a cold start still opened on a
 * spinner and waited out a full server round before it could show anything. Persisting the last
 * graph per scope lets the first paint of the session be the user's actual work, marked stale,
 * while the poller revalidates underneath.
 *
 * Nothing is stripped: the graph is the viewer's own ticket data, which already lives in the app
 * database on the same machine. What IS defended against is schema drift — a graph written by an
 * older build must never reach the plan builder — so every entry is shape-checked on read and a
 * key version bump abandons the whole store.
 */
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

export type PersistedDigestGraph = {
  readonly signature: string;
  readonly graph: DigestGraph;
  readonly viewerUnresolved: boolean;
};

/** Bump when `DigestGraph` changes in a way an older entry cannot satisfy. */
const STORAGE_KEY = "t3team:mywork-digest:graphs:v1";
/** Small on purpose: a graph is a few hundred KB of JSON and localStorage is a ~5 MB budget.
 * Six covers a typical multi-project cold start (several projects + the all-projects scope)
 * without crowding the quota the way an unbounded cache would. */
const MAX_PERSISTED = 6;

/** Arrays the plan builder iterates unconditionally; a missing one would throw on first render. */
const REQUIRED_ARRAYS = [
  "projects",
  "tickets",
  "claims",
  "decisions",
  "changeRequests",
  "transitions",
  "blockers",
] as const;

function isDigestGraph(value: unknown): value is DigestGraph {
  if (value === null || typeof value !== "object") return false;
  const graph = value as Record<string, unknown>;
  if (graph.scope !== "project" && graph.scope !== "all") return false;
  const viewer = graph.viewer as Record<string, unknown> | undefined;
  if (!viewer || typeof viewer.name !== "string" || typeof viewer.lastVisitAt !== "string") {
    return false;
  }
  return REQUIRED_ARRAYS.every((key) => Array.isArray(graph[key]));
}

function isPersistedEntry(value: unknown): value is PersistedDigestGraph {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.signature === "string" &&
    typeof entry.viewerUnresolved === "boolean" &&
    isDigestGraph(entry.graph)
  );
}

/** Least-recently-written first, so a caller can seed an LRU in order. */
export function readPersistedDigestGraphs(): ReadonlyArray<PersistedDigestGraph> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPersistedEntry) : [];
  } catch {
    // Unparseable, or no storage at all (private mode, SSR): start from nothing.
    return [];
  }
}

/** Replaces the stored set with the newest `MAX_PERSISTED` of `entries` (last = most recent). */
export function writePersistedDigestGraphs(entries: ReadonlyArray<PersistedDigestGraph>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_PERSISTED)));
  } catch {
    // Over quota or no storage: the in-memory cache still works, only the cold start loses.
  }
}

/** Test-only: forget the persisted graphs. */
export function clearPersistedDigestGraphsForTests(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear without storage.
  }
}
