/**
 * Where a workflow child works. An opted-in child (`checkout: "launch-thread"`) gets its launch
 * thread's branch and worktree, as a delegated task does, so a recipe run on a worktree thread
 * fixes that worktree rather than the project root. Every other child stays in the root.
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import type { WorkflowHostCreateThreadInput } from "./t3team-workflowHostPort.ts";

export const workflowChildCheckout = (
  threads: ThreadManagementService["Service"],
  input: Pick<WorkflowHostCreateThreadInput, "parentThreadId" | "inheritCheckout">,
) =>
  Effect.gen(function* () {
    const parent =
      input.parentThreadId === undefined || input.inheritCheckout !== true
        ? null
        : yield* threads.getThreadShell(ThreadId.make(input.parentThreadId));
    return { branch: parent?.branch ?? null, worktreePath: parent?.worktreePath ?? null };
  });
