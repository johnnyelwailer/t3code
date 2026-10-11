/**
 * Stale-while-revalidate over the digest's change-request read.
 *
 * The PR listing plus its bounded enrichment is a handful of host CLI calls —
 * seconds, not milliseconds — and the service's own caches (30 s list, 15 s
 * detail) are always cold by the time the next ~90 s digest round arrives. So
 * the digest used to wait on the host every single round, and the Jira half,
 * ready in ~200 ms, painted ~10 s late.
 *
 * Here the digest never waits on a warm read: the last result serves at once
 * and a stale one refreshes in the background (single-flight per app
 * project). Only the very first read waits, and only briefly; past that the
 * digest ships without change requests. Either way, while a background read
 * is in flight the digest says `pending`, so the client re-polls until it
 * lands instead of picking it up a whole poll interval later.
 */

import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";

import type { PullRequestService } from "./pullRequest/PullRequestService.ts";
import { loadPrEntries, type PrReadResult } from "./t3team-myworkDigestPr.ts";
import { loadViewerMergedPrEntries } from "./t3team-myworkDigestMergedPrs.ts";
import { loadViewerPrEntries } from "./t3team-myworkViewerPrLoader.ts";
import type { DigestYesterdayWindow } from "./t3team-myworkDigestYesterdayWindow.ts";

/** How long a cold first read may hold the digest before it ships without change requests. */
const DIGEST_PR_FIRST_READ_WAIT = Duration.millis(1_200);
/** A cached read younger than this serves without a background refresh. */
const DIGEST_PR_FRESH_MS = 30_000;
/** App projects whose last read is kept; the least recently read is dropped past this. */
const MAX_CACHED_READS = 64;

type CachedRead = { readonly read: unknown; readonly atMs: number };

const cachedReads = new Map<string, CachedRead>();
const refreshes = new Map<string, Fiber.Fiber<unknown>>();

export type DigestPrRead = {
  readonly read: PrReadResult | undefined;
  /** A background read is in flight; its result lands on a later round. */
  readonly pending: boolean;
};

function startRefresh<A, R>(key: string, load: Effect.Effect<A, never, R>) {
  return Effect.gen(function* () {
    const running = refreshes.get(key) as Fiber.Fiber<A> | undefined;
    if (running !== undefined) return running;
    // Yield first so the fiber cannot finish (and run its cleanup) before it is registered.
    const fiber = yield* Effect.yieldNow.pipe(
      Effect.andThen(load),
      Effect.tap((read) =>
        Clock.currentTimeMillis.pipe(Effect.map((atMs) => rememberRead(key, read, atMs))),
      ),
      Effect.ensuring(Effect.sync(() => refreshes.delete(key))),
      Effect.forkDetach,
    );
    refreshes.set(key, fiber);
    return fiber;
  });
}

function rememberRead(key: string, read: unknown, atMs: number) {
  cachedReads.delete(key);
  cachedReads.set(key, { read, atMs });
  const oldest = cachedReads.size > MAX_CACHED_READS ? cachedReads.keys().next().value : undefined;
  if (oldest !== undefined) cachedReads.delete(oldest);
}

/** Stale-while-revalidate for one keyed read; `fallback` is what a cold read ships meanwhile. */
export function readCached<A, R>(
  key: string,
  load: Effect.Effect<A, never, R>,
  fallback: A,
  /** How long a read serves without a background refresh; slow-changing facts can wait longer. */
  freshMs = DIGEST_PR_FRESH_MS,
) {
  return Effect.gen(function* () {
    const nowMs = yield* Clock.currentTimeMillis;
    const cached = cachedReads.get(key);
    if (cached !== undefined) {
      if (nowMs - cached.atMs >= freshMs) yield* startRefresh(key, load);
      return { read: cached.read as A, pending: refreshes.has(key) };
    }
    const fiber = yield* startRefresh(key, load);
    const landed = yield* Fiber.join(fiber).pipe(Effect.timeoutOption(DIGEST_PR_FIRST_READ_WAIT));
    return Option.isSome(landed)
      ? { read: landed.value, pending: false }
      : { read: fallback, pending: true };
  });
}

export function loadDigestPrEntries(
  appProjectId: string | undefined,
): Effect.Effect<DigestPrRead, never, PullRequestService> {
  if (appProjectId === undefined) return Effect.succeed({ read: undefined, pending: false });
  return readCached(`project:${appProjectId}`, loadPrEntries(appProjectId), undefined);
}

/** The viewer's PRs across every signed-in host — one read shared by every project. */
export function loadDigestViewerPrEntries() {
  return readCached("viewer", loadViewerPrEntries(), [] as ViewerPrs);
}

/** The viewer's merged PRs inside the window; keyed by both ends (a zone shifts them), so another window never reads this one. */
export function loadDigestViewerMergedPrEntries(window: DigestYesterdayWindow) {
  return readCached(
    `merged:${window.fromMs}:${window.untilMs}`,
    loadViewerMergedPrEntries(window),
    [] as ViewerPrs,
  );
}

type ViewerPrs = Effect.Success<ReturnType<typeof loadViewerPrEntries>>;

export function resetDigestPrCacheForTests(): void {
  cachedReads.clear();
  refreshes.clear();
}
