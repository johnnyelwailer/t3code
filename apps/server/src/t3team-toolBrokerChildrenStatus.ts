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
      Effect.map((shells: ReadonlyArray<ChildThreadShell>) => {
        const unsettled = includeSettled
          ? shells
          : shells.filter((shell) => shell.settledOverride !== "settled");
        const limited = unsettled.slice(0, LIST_ALL_THREAD_CAP);
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
          threads: limited.map((shell) => childStatusFromShell(shell)),
        });
      }),
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
            Effect.map((shells) => {
              // Settled children drop out of the default roster view (GHE #304):
              // transcripts stay reachable (status op, include_settled, the UI
              // fold); only the running + terminal-unsettled set is listed.
              // Bind threadId BEFORE filtering so the mapping stays aligned.
              const settledCount = includeSettled
                ? 0
                : shells.filter(
                    (shell) => shell !== undefined && shell.settledOverride === "settled",
                  ).length;
              const visibleShells = childIds
                .map((threadId, index) => ({ threadId, shell: shells[index] }))
                .filter(
                  (entry) =>
                    includeSettled ||
                    entry.shell === undefined ||
                    entry.shell.settledOverride !== "settled",
                );
              const visible = visibleShells.map(({ threadId, shell }) => {
                return shell
                  ? { threadId, ...childStatusFromShell(shell) }
                  : {
                      threadId,
                      state: "unknown" as const,
                      note: "Child thread is no longer available.",
                    };
              });
              return okResult({
                ok: true,
                scope: "children",
                count: visible.length,
                threads: visible,
                ...(settledCount > 0 ? { settledExcluded: settledCount } : {}),
                ...(visible.length === 0
                  ? {
                      hint:
                        settledCount > 0
                          ? `All ${settledCount} child session(s) are settled; list with include_settled:true to see them.`
                          : `No child sessions started from this thread yet. Use t3team_start_child to spawn one.`,
                    }
                  : {}),
              });
            }),
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
  return loadTarget(deps, threadId).pipe(
    Effect.flatMap((detail) => {
      const status = deriveThreadRunStatus(detail);
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
      return Effect.succeed(
        okResult({
          ok: true,
          ...childStatusFromDetail(detail),
          currentTurn: {
            state: status.latestTurnState ?? "none",
            ...(status.inProgressToolCall ? { inProgress: status.inProgressToolCall } : {}),
            ...(startedAt ? { startedAt } : {}),
            ...(elapsed ? { elapsed } : {}),
          },
          recentActivity: tail,
        }),
      );
    }),
    Effect.catch((error) => Effect.succeed(errorResult(`Failed to read thread status: ${error}`))),
  );
}
