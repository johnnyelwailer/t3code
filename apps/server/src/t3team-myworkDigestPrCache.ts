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

/** How long a cold first read may hold the digest before it ships without change requests. */
export const DIGEST_PR_FIRST_READ_WAIT = Duration.millis(1_200);
/** A cached read younger than this serves without a background refresh. */
export const DIGEST_PR_FRESH_MS = 30_000;
/** App projects whose last read is kept; the least recently read is dropped past this. */
const MAX_CACHED_READS = 64;

type CachedRead = { readonly read: PrReadResult | undefined; readonly atMs: number };

const cachedReads = new Map<string, CachedRead>();
const refreshes = new Map<string, Fiber.Fiber<PrReadResult | undefined>>();

export type DigestPrRead = {
  readonly read: PrReadResult | undefined;
  /** A background read is in flight; its result lands on a later round. */
  readonly pending: boolean;
};

function startRefresh(appProjectId: string) {
  return Effect.gen(function* () {
    const running = refreshes.get(appProjectId);
    if (running !== undefined) return running;
    // Yield first so the fiber cannot finish (and run its cleanup) before it is registered.
    const fiber = yield* Effect.yieldNow.pipe(
      Effect.andThen(loadPrEntries(appProjectId)),
      Effect.tap((read) =>
        Clock.currentTimeMillis.pipe(Effect.map((atMs) => rememberRead(appProjectId, read, atMs))),
      ),
      Effect.ensuring(Effect.sync(() => refreshes.delete(appProjectId))),
      Effect.forkDetach,
    );
    refreshes.set(appProjectId, fiber);
    return fiber;
  });
}

function rememberRead(appProjectId: string, read: PrReadResult | undefined, atMs: number) {
  cachedReads.delete(appProjectId);
  cachedReads.set(appProjectId, { read, atMs });
  const oldest = cachedReads.size > MAX_CACHED_READS ? cachedReads.keys().next().value : undefined;
  if (oldest !== undefined) cachedReads.delete(oldest);
}

export function loadDigestPrEntries(
  appProjectId: string | undefined,
): Effect.Effect<DigestPrRead, never, PullRequestService> {
  return Effect.gen(function* () {
    if (appProjectId === undefined) return { read: undefined, pending: false };
    const nowMs = yield* Clock.currentTimeMillis;
    const cached = cachedReads.get(appProjectId);
    if (cached !== undefined) {
      if (nowMs - cached.atMs >= DIGEST_PR_FRESH_MS) yield* startRefresh(appProjectId);
      return { read: cached.read, pending: refreshes.has(appProjectId) };
    }
    const fiber = yield* startRefresh(appProjectId);
    const landed = yield* Fiber.join(fiber).pipe(Effect.timeoutOption(DIGEST_PR_FIRST_READ_WAIT));
    return Option.isSome(landed)
      ? { read: landed.value, pending: false }
      : { read: undefined, pending: true };
  });
}

/** Test-only: forget every cached read and running refresh. */
export function resetDigestPrCacheForTests(): void {
  cachedReads.clear();
  refreshes.clear();
}
