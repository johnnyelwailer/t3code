/**
 * The thread's active roots: the folders a thread's work really lives in (its own checkout plus
 * the worktrees its children use). Open in editor, file links and the file tree read this list;
 * a later multi-root editor workspace and per-worktree file tree sections build on it.
 *
 * Rule (owner decision 2026-11-11): a folder qualifies only when it exists AND it is
 *   1. the thread's current worktree or the project's primary checkout, or
 *   2. the cwd of a child that is still running, or
 *   3. dirty or holding unpushed commits, or
 *   4. the checkout of an open pull request linked on this thread.
 * "Recently touched" does not qualify: long threads would pull in dozens of settled worktrees.
 * Repo-wide worktree lists are never a source. Leftovers stay reachable later through an explicit
 * "add the rest" action, never a picker.
 *
 * Order: current, primary, running children (newest first), open-PR checkouts, dirty. Cap 8 by
 * default, never more than 12; the oldest clean entries drop first. Missing folders are skipped
 * quietly. Old threads with no children give just their own checkout.
 */
import { normalizeProjectPathForComparison } from "./path.ts";

const THREAD_ACTIVE_ROOTS_CAP = 8;
export const THREAD_ACTIVE_ROOTS_HARD_CAP = 12;

export type ThreadActiveRootReason = "current" | "primary" | "running-child" | "open-pr" | "dirty";

export interface ThreadRootCandidate {
  readonly path: string;
  /** `true` for the thread's own worktree. */
  readonly current?: boolean;
  /** `true` for the project's primary checkout (`workspaceRoot`). */
  readonly primary?: boolean;
  /** A child using this folder as its cwd is running now. */
  readonly runningChild?: boolean;
  /** Checkout of an open pull request linked on this thread. */
  readonly openPullRequest?: boolean;
  /** Uncommitted changes or unpushed commits; `undefined` when unknown. */
  readonly dirty?: boolean;
  /** Whether the folder exists; `undefined` when not checked yet. */
  readonly exists?: boolean;
  /** Last activity of the child using it (ms since epoch); orders entries inside a tier. */
  readonly updatedAtMs?: number;
  /** Display name: the child's name or the branch. */
  readonly label?: string;
}

export interface ThreadActiveRoot {
  readonly path: string;
  readonly reason: ThreadActiveRootReason;
  readonly label?: string;
}

const TIER: Record<ThreadActiveRootReason, number> = {
  current: 0,
  primary: 1,
  "running-child": 2,
  "open-pr": 3,
  dirty: 4,
};

function reasonOf(candidate: ThreadRootCandidate): ThreadActiveRootReason | null {
  if (candidate.current) return "current";
  if (candidate.primary) return "primary";
  if (candidate.runningChild) return "running-child";
  if (candidate.openPullRequest) return "open-pr";
  if (candidate.dirty) return "dirty";
  return null;
}

/** Merges duplicate paths (the strongest reason wins) and applies the rule, order and cap. */
export function selectThreadActiveRoots(
  candidates: ReadonlyArray<ThreadRootCandidate>,
  options: { readonly cap?: number } = {},
): ThreadActiveRoot[] {
  const cap = Math.max(
    1,
    Math.min(options.cap ?? THREAD_ACTIVE_ROOTS_CAP, THREAD_ACTIVE_ROOTS_HARD_CAP),
  );
  const byKey = new Map<string, { root: ThreadActiveRoot; updatedAtMs: number; index: number }>();
  candidates.forEach((candidate, index) => {
    const path = candidate.path.trim();
    if (path.length === 0 || candidate.exists === false) return;
    const reason = reasonOf(candidate);
    if (reason === null) return;
    const key = normalizeProjectPathForComparison(path);
    const updatedAtMs = candidate.updatedAtMs ?? 0;
    const previous = byKey.get(key);
    if (previous && TIER[previous.root.reason] <= TIER[reason]) {
      if (previous.root.reason === reason && updatedAtMs > previous.updatedAtMs) {
        previous.updatedAtMs = updatedAtMs;
      }
      return;
    }
    byKey.set(key, {
      root: { path, reason, ...(candidate.label ? { label: candidate.label } : {}) },
      updatedAtMs,
      index: previous?.index ?? index,
    });
  });
  return [...byKey.values()]
    .sort(
      (a, b) =>
        TIER[a.root.reason] - TIER[b.root.reason] ||
        b.updatedAtMs - a.updatedAtMs ||
        a.index - b.index,
    )
    .slice(0, cap)
    .map((entry) => entry.root);
}

/**
 * The one folder Open in editor and the file tree follow instead of the thread's own cwd: set only
 * when exactly one active root besides `cwd` and the primary checkout exists. Several extra roots
 * never guess; they keep `cwd`.
 */
export function threadFollowRoot(
  roots: ReadonlyArray<ThreadActiveRoot>,
  cwd: string | null | undefined,
): string | null {
  const own = cwd ? normalizeProjectPathForComparison(cwd) : null;
  const extra = roots.filter(
    (root) =>
      root.reason !== "current" &&
      root.reason !== "primary" &&
      normalizeProjectPathForComparison(root.path) !== own,
  );
  return extra.length === 1 ? extra[0]!.path : null;
}

/** The thread-shell fields the candidates read (structurally a subset of the orchestration shell). */
export interface ThreadRootShell {
  readonly id: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly title?: string;
  readonly lineage: { readonly parentThreadId: string | null };
  readonly activeRunId: string | null;
  readonly updatedAt?: { readonly epochMillis: number };
  readonly pullRequests?: ReadonlyArray<{
    readonly snapshot: { readonly state: string; readonly headBranch: string } | null;
  }>;
}

function openPullRequestBranches(shell: ThreadRootShell | undefined): ReadonlySet<string> {
  return new Set(
    (shell?.pullRequests ?? []).flatMap((link) =>
      link.snapshot?.state === "open" ? [link.snapshot.headBranch] : [],
    ),
  );
}

/**
 * Candidates from the thread's own worktree, its project's checkout and its direct children's
 * worktrees. A child counts as an open-PR checkout when it links an open pull request itself, or
 * when its branch is the head of an open pull request linked on the parent thread.
 */
export function threadRootCandidates(input: {
  readonly threadId: string;
  readonly shells: ReadonlyArray<ThreadRootShell>;
  readonly primaryRoot: string | null;
}): ThreadRootCandidate[] {
  const thread = input.shells.find((shell) => shell.id === input.threadId);
  const parentPrBranches = openPullRequestBranches(thread);
  const candidates: ThreadRootCandidate[] = [];
  if (thread?.worktreePath) candidates.push({ path: thread.worktreePath, current: true });
  if (input.primaryRoot) candidates.push({ path: input.primaryRoot, primary: true });
  for (const child of input.shells) {
    if (child.lineage.parentThreadId !== input.threadId || !child.worktreePath) continue;
    const label = child.title || child.branch;
    candidates.push({
      path: child.worktreePath,
      runningChild: child.activeRunId !== null,
      openPullRequest:
        openPullRequestBranches(child).size > 0 ||
        (child.branch !== null && parentPrBranches.has(child.branch)),
      ...(child.updatedAt ? { updatedAtMs: child.updatedAt.epochMillis } : {}),
      ...(label ? { label } : {}),
    });
  }
  return candidates;
}
