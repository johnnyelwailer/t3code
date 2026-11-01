const KEY = "t3team.desktopRoute.claimed.v1";
const LOCK = "t3team.desktopRoute.claim";
const MAX_CLAIMS = 200;
const memory: string[] = [];
let queue: Promise<unknown> = Promise.resolve();

/** An answer older than this is never granted: the card was answered while this computer was away. */
export const DESKTOP_ROUTE_ANSWER_TTL_MS = 10 * 60_000;

type ClaimStorage = Pick<Storage, "getItem" | "setItem">;
type ClaimLocks = (run: () => Promise<void>) => Promise<void>;

function read(storage: Pick<Storage, "getItem"> | null): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function defaultStorage(): ClaimStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Web Locks serialise every window of the app; without them, this window alone. */
const defaultLocks: ClaimLocks = (run) => {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks !== undefined) return locks.request(LOCK, run);
  const next = queue.then(run, run);
  queue = next;
  return next;
};

/**
 * Runs `work` for a request id at most once to success, across restarts and windows: one lock holds
 * the check, the work and the claim together. `work` returns true when it did what it set out to
 * do; a failure is not claimed, so a failing observer never takes the request from the submitting
 * client. Without usable storage the claim holds for this run only.
 */
export async function runDesktopRouteOnce(
  requestId: string,
  work: () => Promise<boolean>,
  deps: { readonly storage?: ClaimStorage | null; readonly locks?: ClaimLocks } = {},
): Promise<void> {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  await (deps.locks ?? defaultLocks)(async () => {
    const stored = read(storage);
    if (memory.includes(requestId) || stored.includes(requestId)) return;
    if (!(await work())) return;
    memory.push(requestId);
    memory.splice(0, Math.max(0, memory.length - MAX_CLAIMS));
    try {
      storage?.setItem(KEY, JSON.stringify([...read(storage), requestId].slice(-MAX_CLAIMS)));
    } catch {
      // The in-memory claim still holds for this run.
    }
  });
}

/** Whether a request was already acted on, without acting. */
export function isDesktopRouteRequestClaimed(
  requestId: string,
  storage: Pick<Storage, "getItem"> | null = defaultStorage(),
): boolean {
  return memory.includes(requestId) || read(storage).includes(requestId);
}
