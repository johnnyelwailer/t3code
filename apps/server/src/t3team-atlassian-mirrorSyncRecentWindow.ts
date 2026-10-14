/**
 * "Recent window first": after a long gap or a first sync, the watermark
 * catch-up walks `updated ASC` from the oldest change and spends minutes on
 * unchanged history before it reaches this month's tickets. This phase walks
 * only the last 45 days, newest first, so the tickets people are working on
 * land (page by page) before the history does.
 *
 * It never touches the watermark: that stays "everything up to here is
 * mirrored", and the catch-up that follows still closes the older remainder
 * and alone records the successful sync.
 */
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import {
  burstPause,
  type MirrorSyncIdentity,
  type T3TeamAtlassianMirrorSyncRequest,
} from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
import { type MirrorPageSource, walkMirrorPages } from "./t3team-atlassian-mirrorSyncPageWalk.ts";
import { readT3TeamMirrorSyncStatus } from "./t3team-atlassian-mirrorSyncState.ts";

const recentWindowDays = 45;
const recentWindowMinutes = recentWindowDays * 24 * 60;

/** Per-loop memory: the recent window is walked once per loop life, not on every catch-up pass. */
export type MirrorRecentWindowState = { done: boolean };

export type MirrorRecentWindowOutcome = "continue" | "superseded";

export const newMirrorRecentWindowState = (): MirrorRecentWindowState => ({ done: false });

/** True when the watermark is missing or older than the recent window. */
function watermarkPredatesRecentWindow(input: {
  readonly nowMs: number;
  readonly watermarkMs: number | undefined;
}): boolean {
  return (
    input.watermarkMs === undefined ||
    input.nowMs - input.watermarkMs > recentWindowMinutes * 60_000
  );
}

/**
 * Mirrors the last 45 days, newest first, when the watermark is too old to make
 * the catch-up useful soon. A failure propagates and leaves the state not done,
 * so the next pass walks the window again (upserts are idempotent). A walk cut
 * short by the page cap still counts as done: the catch-up covers the rest.
 */
export function runMirrorRecentWindowFirst(
  input: T3TeamAtlassianMirrorSyncRequest,
  source: MirrorPageSource,
  identity: MirrorSyncIdentity,
  isSuperseded: () => boolean,
  state: MirrorRecentWindowState,
) {
  return Effect.gen(function* () {
    if (state.done) return "continue" satisfies MirrorRecentWindowOutcome;
    const nowMs = yield* Clock.currentTimeMillis;
    const { watermarkMs, lastSuccessAtMs } = yield* readT3TeamMirrorSyncStatus(identity);
    if (!watermarkPredatesRecentWindow({ nowMs, watermarkMs })) {
      state.done = true;
      return "continue" satisfies MirrorRecentWindowOutcome;
    }
    const end = yield* walkMirrorPages({
      request: input,
      source,
      identity,
      isSuperseded,
      updatedWithinMinutes: recentWindowMinutes,
      newestFirst: true,
      walk: "recent-window",
      trackProgress: lastSuccessAtMs === undefined,
      failureMessage: "Failed to fetch Atlassian mirror page (recent window).",
      onPageStored: () => Effect.void,
    });
    if (end === "superseded") return "superseded" satisfies MirrorRecentWindowOutcome;
    state.done = true;
    yield* Effect.sleep(burstPause);
    return "continue" satisfies MirrorRecentWindowOutcome;
  });
}
