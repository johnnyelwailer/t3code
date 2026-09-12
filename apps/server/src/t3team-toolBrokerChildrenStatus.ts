/**
 * Read-only ops for `t3team.thread.children` (GHE #55): `list` (this thread's
 * children, or the whole project with `all: true`) and `status` (one child's
 * current turn state + recent activity). Both derive state via the shared
 * `deriveThreadRunStatus` primitive.
 *
 * @module t3team-toolBrokerChildrenStatus
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { deriveThreadRunStatus } from "@t3tools/shared/t3team-threadRunStatus";

import { okResult, errorResult } from "./t3team-toolBrokerHelpers.ts";
import {
  childStatusFromDetail,
  childStatusFromShell,
  elapsedMs,
  formatElapsed,
  loadTarget,
  opUsage,
  readString,
} from "./t3team-toolBrokerChildrenShared.ts";
import { liveChildParentIds, loadLiveChildParentIds, buildChildRoster } from "./t3team-toolBrokerChildrenLiveChildren.ts";
import {
  type ChildThreadShell,
  type ChildrenArgs,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";

/** Cap on threads materialized for `list` with `all: true` — a project can hold
 *  many threads and the whole-project view must stay bounded. */
const LIST_ALL_THREAD_CAP = 100;
/** Cap on the recent-activity tail returned by `status`. */
const STATUS_ACTIVITY_TAIL = 8;

export function opList(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const all = args.all === true;
  const includeSettled = args.include_settled === true;
  if (all) {
    return deps.listProjectThreadShells(deps.callerProjectId).pipe(
      Effect.flatMap((shells: ReadonlyArray<ChildThreadShell>) =>
        deps.listParentChildRelations().pipe(
          Effect.map((relations) => {
            const unsettled = includeSettled
              ? shells
              : shells.filter((shell) => shell.settledOverride !== "settled");
            const limited = unsettled.slice(0, LIST_ALL_THREAD_CAP);
            // Waiting fact resolved in memory: every child of a listed row is
            // itself in this project snapshot, so no extra shell loads.
            const byId = new Map<string, ChildThreadShell | undefined>(
              shells.map((shell) => [shell.id.toString(), shell]),
            );
            const waitingParents = liveChildParentIds(
              new Set(limited.map((shell) => shell.id.toString())),
              relations,
              byId,
            );
            return okResult({
              ok: true,
              scope: "project",
              count: limited.length,
              ...(unsettled.length > limited.length
                ? { truncated: true, total: unsettled.length }
                : {}),
              ...(unsettled.length !== shells.length
                ? ({ settledExcluded: shells.length - unsettled.length } as { settledExcluded: number })
                : {}),
              threads: limited.map((shell) =>
                childStatusFromShell(
                  shell,
                  waitingParents.has(shell.id.toString()),
                ),
              ),
            });
          }),
        ),
      ),
      Effect.catch((error) =>
        Effect.succeed(errorResult(`Failed to list project threads: ${error}`)),
      ),
    );
  }

  return deps.loadThreadDetail(deps.callerThreadId).pipe(
    Effect.flatMap((caller) => {
      if (!caller) {
        return Effect.succeed(
          errorResult("Could not read the current thread to list its children."),
        );
      }
      // Children come from the durable parent/child relation (handoff.created /
      // handoff.started), not the caller's own activity load — a coordinator
      // with a large child fleet must list every child, matching the sidebar
      // and fork section (GHE #178).
      return deps.listChildThreadIds(deps.callerThreadId, deps.callerProjectId).pipe(
        Effect.flatMap((childIds) =>
          Effect.forEach(childIds, (threadId) =>
            deps.loadThreadShell(ThreadId.make(threadId)),
          ).pipe(
            Effect.flatMap((shells) =>
              loadLiveChildParentIds(deps, new Set(childIds)).pipe(
                Effect.map((waitingParents) => {
                  // Settled children drop out of the default roster view (GHE
                  // #304): transcripts stay reachable (status op, include_settled,
                  // the UI fold); only running + terminal-unsettled are listed.
                  const { threads, settledExcluded } = buildChildRoster(
                    childIds,
                    shells,
                    includeSettled,
                    waitingParents,
                  );
                  return okResult({
                    ok: true,
                    scope: "children",
                    count: threads.length,
                    threads,
                    ...(settledExcluded > 0 ? { settledExcluded } : {}),
                    ...(threads.length === 0
                      ? {
                          hint:
                            settledExcluded > 0
                              ? `All ${settledExcluded} child session(s) are settled; list with include_settled:true to see them.`
                              : `No child sessions started from this thread yet. Use t3team_start_child to spawn one.`,
                        }
                      : {}),
                  });
                }),
              ),
            ),
            Effect.catch((error) =>
              Effect.succeed(errorResult(`Failed to list child threads: ${error}`)),
            ),
          ),
        ),
        Effect.catch((error) =>
          Effect.succeed(errorResult(`Failed to list child threads: ${error}`)),
        ),
      );
    }),
    Effect.catch((error) => Effect.succeed(errorResult(`Failed to list child threads: ${error}`))),
  );
}

export function opStatus(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const threadId = readString(args.thread_id);
  if (!threadId) {
    return Effect.succeed(errorResult(`${opUsage("status")} — 'thread_id' is required.`));
  }
  return Effect.gen(function* () {
    const detail = yield* loadTarget(deps, threadId);
    // Waiting fact: live work among the target's own t3team children (the
    // durable handoff relation — legacy parent:N sub-runs never count).
    const waitingParents = yield* loadLiveChildParentIds(
      deps,
      new Set([detail.id.toString()]),
    );
    const hasLiveChildren = waitingParents.has(detail.id.toString());
    const status = deriveThreadRunStatus({ ...detail, hasLiveChildren });
    const startedAt = status.latestTurnStartedAt;
    const nowIso = deps.nowIso();
    const elapsed =
      status.state === "running"
        ? formatElapsed(elapsedMs(startedAt, nowIso) ?? 0)
        : status.latestTurnCompletedAt
          ? formatElapsed(elapsedMs(startedAt, status.latestTurnCompletedAt) ?? 0)
          : null;
    const tail = detail.activities.slice(-STATUS_ACTIVITY_TAIL).map((activity) => ({
      kind: activity.kind,
      summary: activity.summary,
      createdAt: activity.createdAt,
    }));
    return okResult({
      ok: true,
      ...childStatusFromDetail(detail, hasLiveChildren),
      currentTurn: {
        state: status.latestTurnState ?? "none",
        ...(status.inProgressToolCall ? { inProgress: status.inProgressToolCall } : {}),
        ...(startedAt ? { startedAt } : {}),
        ...(elapsed ? { elapsed } : {}),
      },
      recentActivity: tail,
    });
  }).pipe(
    Effect.catch((error) => Effect.succeed(errorResult(`Failed to read thread status: ${error}`))),
  );
}
