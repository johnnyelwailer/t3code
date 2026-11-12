/**
 * At most one cloud-session start per project at a time, for delegate_task's `cloudSession`.
 *
 * A started session takes about a minute to appear in the session list, so N delegations in that
 * window (concurrent ones, or sequential ones with different clientRequestIds) would each see "no
 * fitting session" and start their own. The first claim for a project wins for `ttlMs`; later
 * claims learn how long ago it started. The map is process memory: a restart forgets it, and the
 * session list has caught up by then.
 */
import type { ProjectId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

const CLOUD_SESSION_START_GUARD_TTL_MS = 2 * 60 * 1000;

export type CloudSessionStartClaim =
  | { readonly claimed: true }
  | { readonly claimed: false; readonly startedSecondsAgo: number };

export interface CloudSessionStartGuard {
  readonly claim: (projectId: ProjectId) => Effect.Effect<CloudSessionStartClaim>;
  readonly release: (projectId: ProjectId) => Effect.Effect<void>;
}

export const makeCloudSessionStartGuard = Effect.fn("CloudSessionStartGuard.make")(function* (
  ttlMs: number = CLOUD_SESSION_START_GUARD_TTL_MS,
) {
  const started = yield* Ref.make(new Map<ProjectId, number>());
  return {
    claim: (projectId) =>
      Effect.flatMap(Clock.currentTimeMillis, (nowMs) =>
        Ref.modify(started, (current): [CloudSessionStartClaim, Map<ProjectId, number>] => {
          const at = current.get(projectId);
          if (at !== undefined && nowMs - at < ttlMs) {
            return [
              { claimed: false, startedSecondsAgo: Math.floor((nowMs - at) / 1000) },
              current,
            ];
          }
          const next = new Map(current);
          next.set(projectId, nowMs);
          return [{ claimed: true }, next];
        }),
      ),
    release: (projectId) =>
      Ref.update(started, (current) => {
        const next = new Map(current);
        next.delete(projectId);
        return next;
      }),
  } satisfies CloudSessionStartGuard;
});
