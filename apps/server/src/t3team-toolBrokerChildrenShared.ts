/**
 * Shared helpers for the `t3team.thread.children` op modules: argument
 * coercion and same-project target loading. The per-op usage strings live in
 * `t3team-toolBrokerChildrenUsage` and are re-exported here as `opUsage`.
 *
 * @module t3team-toolBrokerChildrenShared
 */
import { ThreadId, type OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  T3TEAM_CHILDREN_TOOL_ID,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";

export { opUsage } from "./t3team-toolBrokerChildrenUsage.ts";

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Loads a target thread's shell, failing with a readable message when it is
 *  missing or in another project. */
export function loadTarget(
  deps: T3TeamChildrenToolDeps,
  threadId: string,
): Effect.Effect<OrchestrationV2ThreadShell, string> {
  return deps.loadThreadShell(ThreadId.make(threadId)).pipe(
    Effect.flatMap((shell) => {
      if (!shell) return Effect.fail(`Thread ${threadId} was not found.`);
      if (shell.projectId !== deps.callerProjectId) {
        return Effect.fail(
          `Thread ${threadId} is in a different project; ${T3TEAM_CHILDREN_TOOL_ID} only reaches threads in the caller's project.`,
        );
      }
      return Effect.succeed(shell);
    }),
  );
}
