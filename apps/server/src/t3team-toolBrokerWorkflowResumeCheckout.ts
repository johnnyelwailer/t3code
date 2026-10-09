/**
 * The checkout a resumed run's `ctx.workspace` is rooted at: its LAUNCH thread's (the worktree
 * when it has one), exactly as the fresh launch and boot rehydration derive it. Not the resuming
 * thread's: a run is resumed from wherever the operator is, but its scripts edit the checkout it
 * was launched on. A launch thread that can no longer be read falls back to the project root.
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { WorkflowResumeToolDeps } from "./t3team-toolBrokerWorkflowResumeActions.ts";
import { threadCheckoutRoot } from "./t3team-threadCheckoutRoot.ts";

export const resumeCheckoutRoot = <E>(
  deps: Pick<WorkflowResumeToolDeps<E>, "loadThreadProject" | "path">,
  input: {
    readonly run: { readonly launchThreadId: string | null };
    readonly threadId: ThreadId;
    readonly workspaceRoot: string;
  },
) =>
  Effect.gen(function* () {
    const launchThreadId =
      input.run.launchThreadId === null ? input.threadId : ThreadId.make(input.run.launchThreadId);
    const loaded = yield* deps
      .loadThreadProject(launchThreadId)
      .pipe(Effect.catch(() => Effect.succeed(undefined)));
    const root = threadCheckoutRoot(loaded?.thread, input.workspaceRoot);
    return deps.path === undefined ? root : deps.path.resolve(root);
  });
