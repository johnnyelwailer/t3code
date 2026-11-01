const KEY = "t3team.desktopRoute.claimed.v1";
const MAX_CLAIMS = 200;
const memory: string[] = [];

/** An answer older than this is never granted: the card was answered while this computer was away. */
export const DESKTOP_ROUTE_ANSWER_TTL_MS = 10 * 60_000;

function read(storage: Pick<Storage, "getItem"> | null): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * True exactly once per request id, across restarts: the submitting client and the observer both
 * ask, and only the first may act. Without usable storage it holds for this run only.
 */
export function claimDesktopRouteRequest(
  requestId: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null = defaultStorage(),
): boolean {
  const stored = read(storage);
  if (memory.includes(requestId) || stored.includes(requestId)) return false;
  memory.push(requestId);
  memory.splice(0, Math.max(0, memory.length - MAX_CLAIMS));
  try {
    storage?.setItem(KEY, JSON.stringify([...stored, requestId].slice(-MAX_CLAIMS)));
  } catch {
    // The in-memory claim still holds for this run.
  }
  return true;
}
