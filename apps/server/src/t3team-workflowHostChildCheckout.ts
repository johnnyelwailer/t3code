/**
 * Where a workflow child works. An opted-in child (`checkout: "launch-thread"`) gets its launch
 * thread's branch and worktree, as a delegated task does, so a recipe run on a worktree thread
 * fixes that worktree rather than the project root. Every other child stays in the root.
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { T3TeamWorkflowHostError } from "./t3team-workflowHostFail.ts";
import type { WorkflowHostCreateThreadInput } from "./t3team-workflowHostPort.ts";

export const workflowChildCheckout = (
  threads: ThreadManagementService["Service"],
  input: Pick<WorkflowHostCreateThreadInput, "parentThreadId" | "inheritCheckout">,
) =>
  Effect.gen(function* () {
    // A headless run has no launch thread, so the root is all there is to inherit.
    if (input.parentThreadId === undefined || input.inheritCheckout !== true) {
      return { branch: null, worktreePath: null };
    }
    const parent = yield* threads.getThreadShell(ThreadId.make(input.parentThreadId));
    // Falling back to the root here would let a recipe that asked to fix a PR branch edit the
    // project root instead, so a launch thread that cannot be read fails the spawn.
    if (parent === null) {
      return yield* Effect.fail(
        new T3TeamWorkflowHostError({
          operation: "createThread",
          message: `Cannot inherit the checkout of launch thread ${input.parentThreadId}: not found.`,
        }),
      );
    }
    return { branch: parent.branch, worktreePath: parent.worktreePath };
  });
