/**
 * How current a work-item read answer is, and which row a `get` answers from. Pure: the port supplies
 * the mirror's sync state. A live answer has no `syncedAt`: the tracker was just asked.
 */
import type { WorkItemFreshness } from "@t3team/sdk";
import * as DateTime from "effect/DateTime";

import type { WorkItemResource } from "./t3team-workItemReadQuery.ts";

export interface MirrorFreshness {
  readonly syncedAtMs: number | undefined;
  readonly stale: boolean;
}

export const toMirrorFreshness = (status: {
  readonly lastSuccessAtMs: number | undefined;
  readonly lastError: string | undefined;
}): MirrorFreshness => ({
  syncedAtMs: status.lastSuccessAtMs,
  stale: status.lastError !== undefined,
});

export const liveFreshness: WorkItemFreshness = { source: "live" };

export const mirrorAnswerFreshness = (mirror: MirrorFreshness): WorkItemFreshness => ({
  source: "mirror",
  ...(mirror.syncedAtMs === undefined
    ? {}
    : { syncedAt: DateTime.formatIso(DateTime.makeUnsafe(mirror.syncedAtMs)) }),
  ...(mirror.stale ? { stale: true } : {}),
});

export interface FoundWorkItem {
  readonly row: WorkItemResource;
  readonly source: "mirror" | "live";
}

const updatedAtMs = (row: WorkItemResource): number | undefined => {
  const raw = row["updatedAt"];
  const ms = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
  return Number.isNaN(ms) ? undefined : ms;
};

/**
 * The row to answer a `get` from. The tracker's row was fetched to prove the key is in the project, so
 * it is free; the mirror row wins unless it is demonstrably older (or carries no readable time while
 * the tracker's does). Equal or unreadable times keep the mirror row, the answer before this existed.
 */
export function fresherRow(mirror: WorkItemResource | null, live: WorkItemResource): FoundWorkItem {
  if (mirror === null) return { row: live, source: "live" };
  const mirrorMs = updatedAtMs(mirror);
  const liveMs = updatedAtMs(live);
  const liveIsNewer = liveMs !== undefined && (mirrorMs === undefined || liveMs > mirrorMs);
  return liveIsNewer ? { row: live, source: "live" } : { row: mirror, source: "mirror" };
}
