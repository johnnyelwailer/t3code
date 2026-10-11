/**
 * The directory a thread works in: its own worktree when it has one, else the project root.
 *
 * The one place that rule lives, so the change-request tool (which commits from it) and a workflow
 * run's `ctx.workspace` (which writes the files that get committed) cannot disagree about it.
 */
export const threadCheckoutRoot = (
  thread: { readonly worktreePath?: string | null | undefined } | undefined,
  projectRoot: string,
): string => thread?.worktreePath ?? projectRoot;
