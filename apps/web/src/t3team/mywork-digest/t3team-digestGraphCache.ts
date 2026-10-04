/**
 * The last digest graph per scope signature, for the lifetime of the page.
 *
 * Re-opening My Work (switching projects, lenses or routes and back) used to
 * start from a spinner and wait out a full server round. The last graph paints
 * at once instead while the poller revalidates it underneath — the server
 * mirror stays the durable cache, this only spares the remount round trip.
 */
import type {
  MyWorkDigestProjectInput,
  MyWorkDigestScope,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

type CachedDigestGraph = {
  readonly graph: DigestGraph;
  readonly viewerUnresolved: boolean;
};

const MAX_ENTRIES = 16;
const graphs = new Map<string, CachedDigestGraph>();

export function writeCachedDigestGraph(
  signature: string,
  graph: DigestGraph,
  viewerUnresolved: boolean,
): void {
  graphs.delete(signature);
  graphs.set(signature, { graph, viewerUnresolved });
  if (graphs.size > MAX_ENTRIES) {
    const oldest = graphs.keys().next().value;
    if (oldest !== undefined) graphs.delete(oldest);
  }
}

export function digestScopeSignature(
  scope: MyWorkDigestScope,
  entries: ReadonlyArray<MyWorkDigestProjectInput>,
): string {
  // appProjectId is part of the key: two app projects can bind the same Jira project.
  return `${scope}|${entries
    .map((entry) => `${entry.account.id}:${entry.externalProjectId}:${entry.appProjectId ?? ""}`)
    .join("|")}`;
}

/** The hook's first-paint state for a scope: the cached graph (ready) or nothing yet (loading). */
export function readInitialDigestState(signature: string): {
  readonly graph: DigestGraph | null;
  readonly status: "loading" | "ready";
  readonly viewerUnresolved: boolean;
} {
  const cached = graphs.get(signature);
  return cached
    ? { graph: cached.graph, status: "ready", viewerUnresolved: cached.viewerUnresolved }
    : { graph: null, status: "loading", viewerUnresolved: false };
}

const PENDING_RETRY_MS = 2_500;
/** ~30 s of fast retries per pending episode; past that the regular poll takes over. */
const MAX_PENDING_RETRIES = 12;

/**
 * Re-polls soon while the server says change requests are still being read. A
 * retry that lands while the read is still running answers `unchanged` (the
 * pending payload hashes the same), so `unchanged` keeps the last pending state
 * and keeps retrying instead of dropping back to the regular poll.
 */
export function createDigestPendingRetry() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  let attempts = 0;
  return {
    /** `undefined` = an unchanged round: keep whatever the last payload said. */
    update(nextPending: boolean | undefined, run: () => void): void {
      clearTimeout(timer);
      if (nextPending !== undefined) pending = nextPending;
      if (!pending) attempts = 0;
      if (!pending || attempts >= MAX_PENDING_RETRIES) return;
      attempts += 1;
      timer = setTimeout(run, PENDING_RETRY_MS);
    },
    dispose(): void {
      clearTimeout(timer);
      pending = false;
      attempts = 0;
    },
  };
}

/** Test-only: forget every cached graph. */
export function clearCachedDigestGraphsForTests(): void {
  graphs.clear();
}
