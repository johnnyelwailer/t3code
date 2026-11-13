declare global {
  interface Window {
    t3teamWatchdog?: {
      reportHeartbeat: (payload: {
        at?: number;
        lastComponentRenderCounts?: Readonly<Record<string, number>> | null;
      }) => void;
    };
  }
}

const counts = new Map<string, number>();

/** Optional snapshot the watchdog logs when the renderer becomes unresponsive. */
export function recordComponentRender(name: string): void {
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

export function snapshotRenderCounts(): Readonly<Record<string, number>> {
  return Object.fromEntries(counts);
}

export function resetRenderCounts(): void {
  counts.clear();
}

const HEARTBEAT_INTERVAL_MS = 2_000;

/**
 * Tell the Electron main process this renderer is still alive. No-op in the browser
 * (no `t3teamWatchdog` bridge). The main-process timeout only arms after the first
 * heartbeat, so skipping this on web is safe.
 */
export function startRendererHeartbeat(input?: {
  readonly intervalMs?: number;
  readonly now?: () => number;
  readonly report?: (payload: {
    at?: number;
    lastComponentRenderCounts?: Readonly<Record<string, number>> | null;
  }) => void;
}): () => void {
  const report =
    input?.report ??
    ((payload) => {
      const bridge = typeof window === "undefined" ? undefined : window.t3teamWatchdog;
      bridge?.reportHeartbeat(payload);
    });
  const now = input?.now ?? (() => Date.now());
  const intervalMs = input?.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const send = () => report({ at: now(), lastComponentRenderCounts: snapshotRenderCounts() });
  send();
  const id = setInterval(send, intervalMs);
  return () => clearInterval(id);
}
