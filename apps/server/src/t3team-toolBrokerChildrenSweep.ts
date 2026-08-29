/**
 * `sweep` op for `t3team.thread.children` (GHE #304 part D): the mechanical
 * bulk-settle. The cleanup PROTOCOL — verify each child's state (final result
 * / discarded work / unpushed work in worktrees) — is the CALLER's job,
 * typically a dedicated cleanup child; this op only settles. Targets:
 * explicit thread ids and/or "all terminal children older than X hours".
 * Non-terminal threads are skipped with a reason, never force-settled.
 *
 * @module t3team-toolBrokerChildrenSweep
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { deriveThreadRunState, type ThreadRunState } from "@t3tools/shared/t3team-threadRunStatus";

import { okResult, errorResult } from "./t3team-toolBrokerHelpers.ts";
import { opUsage, readString } from "./t3team-toolBrokerChildrenShared.ts";
import {
  type ChildrenArgs,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";

/** Cap on explicit ids per call: bulk means bounded bulk, not "everything". */
const SWEEP_MAX_EXPLICIT_IDS = 200;

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    const id = readString(entry);
    if (id !== undefined) out.push(id);
  }
  return out.length > 0 ? out.slice(0, SWEEP_MAX_EXPLICIT_IDS) : undefined;
}

function isTerminal(state: ThreadRunState): boolean {
  return state === "completed" || state === "failed" || state === "aborted";
}

export function opSweep(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const explicitIds = readStringArray(args.thread_ids);
  let olderThanHours: number | undefined;
  if (args.all_older_than_hours !== undefined) {
    if (
      typeof args.all_older_than_hours !== "number" ||
      !Number.isFinite(args.all_older_than_hours)
    ) {
      return Effect.succeed(
        errorResult(`${opUsage("sweep")} — 'all_older_than_hours' must be a number of hours.`),
      );
    }
    olderThanHours = args.all_older_than_hours;
  }
  if (explicitIds === undefined && olderThanHours === undefined) {
    return Effect.succeed(
      errorResult(
        `${opUsage("sweep")} — pass 'thread_ids' (array) and/or 'all_older_than_hours' (number).`,
      ),
    );
  }

  const nowMs = Date.parse(deps.nowIso());

  return Effect.gen(function* () {
    const skipped: Array<{
      readonly threadId: string;
      readonly title: string;
      readonly reason: string;
    }> = [];
    const errors: Array<{ readonly threadId: string; readonly error: string }> = [];
    const settled = new Set<string>();

    const settleOne = (threadId: string, title: string, state: ThreadRunState) =>
      Effect.gen(function* () {
        if (!isTerminal(state)) {
          skipped.push({
            threadId,
            title,
            reason: `state is '${state}', not terminal — only completed/failed/aborted threads can be swept`,
          });
          return;
        }
        yield* deps.settleThread(ThreadId.make(threadId));
        settled.add(threadId);
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            void errors.push({
              threadId,
              error: `thread ${threadId} could not be settled: ${String(error)}`,
            }),
          ),
        ),
      );

    // Explicit ids: per-id verification is the caller's job; the op is the
    // mechanical settle (missing threads and cross-project targets skip).
    if (explicitIds !== undefined) {
      for (const threadId of explicitIds) {
        const detail = yield* deps
          .loadThreadDetail(ThreadId.make(threadId))
          .pipe(Effect.orElseSucceed(() => undefined));
        if (detail === undefined) {
          skipped.push({ threadId, title: "(missing)", reason: "thread not found" });
          continue;
        }
        if (detail.projectId !== deps.callerProjectId) {
          skipped.push({ threadId, title: detail.title, reason: "in a different project" });
          continue;
        }
        yield* settleOne(detail.id as string, detail.title, deriveThreadRunState(detail));
      }
    }

    // "All terminal children older than X hours": the caller's own children
    // from the durable relation (the same source list/status use), so a sweep
    // never reaches outside this parent's roster.
    if (olderThanHours !== undefined) {
      const childIds = yield* deps.listChildThreadIds(deps.callerThreadId, deps.callerProjectId);
      for (const threadId of childIds) {
        const shell = yield* deps
          .loadThreadShell(ThreadId.make(threadId))
          .pipe(Effect.orElseSucceed(() => undefined));
        if (shell === undefined) {
          skipped.push({ threadId, title: "(missing)", reason: "thread not found" });
          continue;
        }
        if (settled.has(threadId)) continue;
        const state = deriveThreadRunState(shell);
        if (!isTerminal(state)) {
          skipped.push({
            threadId,
            title: shell.title,
            reason: `state is '${state}', not terminal`,
          });
          continue;
        }
        const ageMs = nowMs - Date.parse(shell.updatedAt);
        if (!Number.isFinite(ageMs) || ageMs < olderThanHours * 3_600_000) continue;
        yield* settleOne(threadId, shell.title, state);
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
  }).pipe(
    Effect.mapError((error) => error),
    Effect.catch((error) => Effect.succeed(errorResult(`Sweep failed: ${String(error)}`))),
  );
}
