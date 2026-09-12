/**
 * The `waiting` fact for `t3team.thread.children` rows: which of the given
 * parent threads have one or more LIVE t3team children — non-settled and not
 * in a terminal run state (completed/failed/aborted).
 *
 * The relation source is the durable parent/child relation
 * (t3team.handoff.created / t3team.handoff.started, via
 * `listParentChildRelations`) — the legacy `parent:N` sub-run scheme never
 * emits handoff events and therefore can never trigger waiting. A relation
 * whose child shell is missing (a gone thread) counts as dead: you cannot
 * wait on work that no longer exists.
 *
 * @module t3team-toolBrokerChildrenLiveChildren
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  deriveThreadRunState,
  isTerminalThreadRunState,
} from "@t3tools/shared/t3team-threadRunStatus";

import { childStatusFromShell } from "./t3team-toolBrokerChildrenShared.ts";
import {
  type ChildThreadShell,
  type ParentChildRelation,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";

/** True when this child keeps its parent waiting. */
export function isLiveChildShell(shell: ChildThreadShell): boolean {
  if (shell.settledOverride === "settled") return false;
  return !isTerminalThreadRunState(
    deriveThreadRunState({
      session: shell.session,
      latestTurn: shell.latestTurn,
      ...(shell.backgroundLiveness !== undefined
        ? { backgroundLiveness: shell.backgroundLiveness }
        : {}),
    }),
  );
}

/**
 * Parent ids (of the given set) that have one or more live child, resolved
 * against a preloaded child-shell map. Pure — no I/O; callers build the map
 * from shells they already hold or load on demand.
 */
export function liveChildParentIds(
  wantedParents: ReadonlySet<string>,
  relations: ReadonlyArray<ParentChildRelation>,
  childShellsById: ReadonlyMap<string, ChildThreadShell | undefined>,
): ReadonlySet<string> {
  const waiting = new Set<string>();
  for (const relation of relations) {
    if (!wantedParents.has(relation.parentThreadId)) continue;
    const childShell = childShellsById.get(relation.childThreadId);
    if (childShell !== undefined && isLiveChildShell(childShell)) {
      waiting.add(relation.parentThreadId);
    }
  }
  return waiting;
}

/**
 * Durable variant for the ops: one store-wide relation query + one shell
 * load per distinct child of the wanted parents (bounded concurrency).
 * Returns the subset of `wantedParents` with a live child.
 */
export function loadLiveChildParentIds(
  deps: T3TeamChildrenToolDeps,
  wantedParents: ReadonlySet<string>,
): Effect.Effect<ReadonlySet<string>, string> {
  if (wantedParents.size === 0) return Effect.succeed(new Set<string>());
  return deps.listParentChildRelations().pipe(
    Effect.flatMap((relations) => {
      const childIds = [
        ...new Set(
          relations
            .filter((relation) => wantedParents.has(relation.parentThreadId))
            .map((relation) => relation.childThreadId),
        ),
      ];
      return Effect.forEach(
        childIds,
        (id) => deps.loadThreadShell(ThreadId.make(id)),
        { concurrency: 8 },
      ).pipe(
        Effect.map((shells) =>
          liveChildParentIds(
            wantedParents,
            relations,
            new Map(
              childIds.map((id, index) => [id, shells[index] ?? undefined]),
            ),
          ),
        ),
      );
    }),
  );
}

/**
 * The default-children roster: one row per child id (missing shell →
 * `unknown`), settled children dropped unless `includeSettled`, each row
 * carrying the waiting fact. Pure — shells and the waiting set are inputs.
 */
export function buildChildRoster(
  childIds: ReadonlyArray<string>,
  shells: ReadonlyArray<ChildThreadShell | undefined>,
  includeSettled: boolean,
  waitingParents: ReadonlySet<string>,
): { readonly threads: Array<Record<string, unknown>>; readonly settledExcluded: number } {
  const settledExcluded = includeSettled
    ? 0
    : shells.filter((shell) => shell !== undefined && shell.settledOverride === "settled").length;
  const threads = childIds
    .map((threadId, index) => ({ threadId, shell: shells[index] }))
    .filter(
      (entry) =>
        includeSettled || entry.shell === undefined || entry.shell.settledOverride !== "settled",
    )
    .map(({ threadId, shell }) =>
      shell !== undefined
        ? { threadId, ...childStatusFromShell(shell, waitingParents.has(threadId)) }
        : { threadId, state: "unknown", note: "Child thread is no longer available." },
    );
  return { threads, settledExcluded };
}
