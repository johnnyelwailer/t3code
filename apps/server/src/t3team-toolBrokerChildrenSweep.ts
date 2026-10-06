/**
 * `sweep` op for `t3team.thread.children`: the mechanical bulk-settle. The
 * cleanup PROTOCOL — verify each child's state (final result / discarded work
 * / unpushed work in worktrees) — is the CALLER's job, typically a dedicated
 * cleanup child; this op only settles. Targets: explicit thread ids and/or
 * "all finished children older than X hours" (children = V2 lineage).
 * Running threads are skipped with a reason, never force-settled.
 *
 * @module t3team-toolBrokerChildrenSweep
 */
import { ThreadId, type OrchestrationV2ThreadShell } from "@t3tools/contracts";
import {
  deriveThreadRunState,
  isTerminalThreadRunState,
} from "@t3tools/shared/t3team-threadRunStatus";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { opUsage, readString } from "./t3team-toolBrokerChildrenShared.ts";
import {
  type ChildrenArgs,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";

/** Cap on explicit ids per call: bulk means bounded bulk, not "everything". */
const SWEEP_MAX_EXPLICIT_IDS = 200;

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.flatMap((entry) => {
    const id = readString(entry);
    return id === undefined ? [] : [id];
  });
  return ids.length > 0 ? ids.slice(0, SWEEP_MAX_EXPLICIT_IDS) : undefined;
}

const finishedAtMs = (shell: OrchestrationV2ThreadShell) =>
  DateTime.toEpochMillis(shell.latestRunCompletedAt ?? shell.updatedAt);

export function opSweep(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const explicitIds = readStringArray(args.thread_ids);
  const olderThan = args.all_older_than_hours;
  if (olderThan !== undefined && (typeof olderThan !== "number" || !Number.isFinite(olderThan))) {
    return Effect.succeed(
      errorResult(`${opUsage("sweep")} — 'all_older_than_hours' must be a number of hours.`),
    );
  }
  if (explicitIds === undefined && olderThan === undefined) {
    return Effect.succeed(
      errorResult(
        `${opUsage("sweep")} — pass 'thread_ids' (array) and/or 'all_older_than_hours' (number).`,
      ),
    );
  }
  const nowMs = Date.parse(deps.nowIso());

  return Effect.gen(function* () {
    const skipped: Array<{ threadId: string; title: string; reason: string }> = [];
    const errors: Array<{ threadId: string; error: string }> = [];
    const settled = new Set<string>();

    const settleOne = (shell: OrchestrationV2ThreadShell) =>
      Effect.gen(function* () {
        if (settled.has(shell.id) || shell.settledOverride === "settled") return;
        const state = deriveThreadRunState(shell);
        if (!isTerminalThreadRunState(state)) {
          skipped.push({
            threadId: shell.id,
            title: shell.title,
            reason: `state is '${state}', not finished — only completed/failed/aborted threads are swept`,
          });
          return;
        }
        yield* deps.settleThread(shell.id).pipe(
          Effect.map(() => void settled.add(shell.id)),
          Effect.catch((error) =>
            Effect.sync(() => void errors.push({ threadId: shell.id, error: String(error) })),
          ),
        );
      });

    for (const threadId of explicitIds ?? []) {
      const shell = yield* deps
        .loadThreadShell(ThreadId.make(threadId))
        .pipe(Effect.orElseSucceed(() => undefined));
      if (shell === undefined) {
        skipped.push({ threadId, title: "(missing)", reason: "thread not found" });
      } else if (shell.projectId !== deps.callerProjectId) {
        skipped.push({ threadId, title: shell.title, reason: "in a different project" });
      } else {
        yield* settleOne(shell);
      }
    }

    if (typeof olderThan === "number") {
      const shells = yield* deps.listProjectThreadShells(deps.callerProjectId);
      const cutoffMs = nowMs - olderThan * 3_600_000;
      for (const shell of shells) {
        if (shell.lineage.parentThreadId !== deps.callerThreadId) continue;
        if (finishedAtMs(shell) > cutoffMs) continue;
        yield* settleOne(shell);
      }
    }

    return okResult({
      ok: true,
      op: "sweep",
      settled: Array.from(settled),
      settledCount: settled.size,
      ...(skipped.length > 0 ? { skipped } : {}),
      ...(errors.length > 0 ? { errors } : {}),
      hint:
        settled.size > 0
          ? "Settled threads keep their full transcripts; they drop out of the active rosters."
          : "Nothing was settled. Verify each child's state (final result / discarded work / " +
            "unpushed work in worktrees) before re-running the sweep.",
    });
  }).pipe(Effect.catch((error) => Effect.succeed(errorResult(`Sweep failed: ${String(error)}`))));
}
