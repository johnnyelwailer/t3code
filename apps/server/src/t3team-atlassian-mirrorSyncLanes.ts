/**
 * Which mirror loops may walk Jira at the same time.
 *
 * A project the viewer is looking at (one project's My Work) walks in the foreground: it is never
 * queued behind another project. The "All projects" digest kicks every bound project at once, and
 * letting each of those loops walk in parallel (catch-up pages, upserts, transition capture) is what
 * saturated SQLite and kept the All projects view refreshing forever. Background loops therefore
 * take turns: one pass at a time across the whole app. A foreground kick promotes a running
 * background loop, so opening that project directly never waits on the queue.
 */
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

export type MirrorSyncLane = "foreground" | "background";

/** Background passes across every project: one at a time. */
const BACKGROUND_MIRROR_PASS_PERMITS = 1;

const backgroundPasses = Semaphore.makeUnsafe(BACKGROUND_MIRROR_PASS_PERMITS);

/** The lane each running loop walks in, by single-flight key; foreground wins over background. */
const laneByKey = new Map<string, MirrorSyncLane>();

/** Record a kick's lane. A foreground kick promotes; a background kick never demotes. */
export function noteMirrorSyncLane(mapKey: string, lane: MirrorSyncLane): void {
  if (lane === "foreground" || !laneByKey.has(mapKey)) laneByKey.set(mapKey, lane);
}

export function forgetMirrorSyncLane(mapKey: string): void {
  laneByKey.delete(mapKey);
}

export function mirrorSyncLaneOf(mapKey: string): MirrorSyncLane {
  return laneByKey.get(mapKey) ?? "foreground";
}

/** Run one sync pass in its lane: background passes queue for the shared permit. */
export function withMirrorSyncLane<A, E, R>(
  mapKey: string,
  pass: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.suspend(() =>
    mirrorSyncLaneOf(mapKey) === "background" ? backgroundPasses.withPermits(1)(pass) : pass,
  );
}

/** Test-only: forget every lane. */
export function clearMirrorSyncLanesForTests(): void {
  laneByKey.clear();
}
