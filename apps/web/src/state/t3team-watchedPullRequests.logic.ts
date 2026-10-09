/**
 * Pure derivation behind the universal watched-PR indicator: which threads watch which pull
 * request, and what state each watcher is in. One place computes it (doc 07 §3.1); no surface
 * reads `link.watch` itself.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { T3TeamThreadFactsByThreadId } from "@t3tools/client-runtime/state/thread-facts";
import {
  readPrWatchThreadFact,
  readT3TeamLaunchedByFact,
  recipeIdOfLaunchScope,
  type EnvironmentId,
  type PrWatchThreadFact,
  type RuntimeMode,
  type ScopedThreadRef,
  type T3TeamThreadFacts,
  type ThreadPullRequestLink,
} from "@t3tools/contracts";
import {
  threadPullRequestKeyOf,
  visibleThreadPullRequests,
} from "@t3tools/shared/threadPullRequests";

/** Needs-you outranks attention (approval or parked), which outranks a fix in progress. */
export type WatchedPullRequestTone = "quiet" | "working" | "attention" | "needs-you";

export type WatchedPullRequestStatusLabel =
  | "Working"
  | "Awaiting Input"
  | "Pending Approval"
  | "Parked"
  | "Waiting";

export type WatchedPullRequestWatcher = {
  readonly threadRef: ScopedThreadRef;
  readonly threadTitle: string;
  readonly projectId: EnvironmentThreadShell["projectId"];
  readonly link: ThreadPullRequestLink;
  readonly tone: WatchedPullRequestTone;
  readonly statusLabel: WatchedPullRequestStatusLabel;
  readonly runtimeMode: RuntimeMode;
  readonly activityLabel: string | null;
  /** When the current work started, for a "Working · 4m" elapsed label. */
  readonly workingSince: string | null;
  /** The recipe whose run launched this thread (`t3team.launchedBy`); null for a thread of its own. */
  readonly recipeId: string | null;
  /** The babysitter's chips; null for a thread that watches on its own. */
  readonly prWatch: PrWatchThreadFact | null;
  readonly hasPendingUserInput: boolean;
};

export type WatchedPullRequestsByKey = ReadonlyMap<
  string,
  ReadonlyArray<WatchedPullRequestWatcher>
>;

export const EMPTY_WATCHED_PULL_REQUESTS: WatchedPullRequestsByKey = new Map();
export const NO_WATCHERS: ReadonlyArray<WatchedPullRequestWatcher> = Object.freeze([]);

const TONE_RANK: Record<WatchedPullRequestTone, number> = {
  quiet: 0,
  working: 1,
  attention: 2,
  "needs-you": 3,
};

/** Same rule as the panel and the mini list: a watch only matters while the pull request is open. */
export function isWatchedOpenLink(link: ThreadPullRequestLink): boolean {
  return link.watch !== undefined && (link.snapshot === null || link.snapshot.state === "open");
}

/** A fix is in progress while the thread has an active run (engine contract: `activeRunId !== null`). */
export function isShellWorking(shell: Pick<EnvironmentThreadShell, "runtime">): boolean {
  return shell.runtime?.activeRunId != null;
}

export function resolveWatcherState(
  shell: Pick<EnvironmentThreadShell, "hasPendingUserInput" | "hasPendingApprovals" | "runtime">,
  prWatch: PrWatchThreadFact | null,
): { tone: WatchedPullRequestTone; statusLabel: WatchedPullRequestStatusLabel } {
  if (shell.hasPendingUserInput) return { tone: "needs-you", statusLabel: "Awaiting Input" };
  if (shell.hasPendingApprovals) return { tone: "attention", statusLabel: "Pending Approval" };
  if (prWatch?.parked) return { tone: "attention", statusLabel: "Parked" };
  if (isShellWorking(shell)) return { tone: "working", statusLabel: "Working" };
  return { tone: "quiet", statusLabel: "Waiting" };
}

export function buildWatcher(
  shell: EnvironmentThreadShell,
  facts: T3TeamThreadFacts | undefined,
  link: ThreadPullRequestLink,
): WatchedPullRequestWatcher {
  const prWatch = readPrWatchThreadFact(facts?.extensions);
  const launchedBy = readT3TeamLaunchedByFact(facts?.extensions);
  const { tone, statusLabel } = resolveWatcherState(shell, prWatch);
  return {
    threadRef: { environmentId: shell.environmentId, threadId: shell.id },
    threadTitle: shell.title,
    projectId: shell.projectId,
    link,
    tone,
    statusLabel,
    runtimeMode: shell.runtimeMode,
    activityLabel: facts?.activityLabel ?? null,
    workingSince: tone === "working" ? (shell.latestRun?.requestedAt ?? null) : null,
    recipeId: recipeIdOfLaunchScope(launchedBy?.scope),
    prWatch,
    hasPendingUserInput: shell.hasPendingUserInput,
  };
}

/** Live threads only: a deleted or archived thread's watch is already over on the server. */
export function isLiveShell(
  shell: Pick<EnvironmentThreadShell, "deletedAt" | "archivedAt">,
): boolean {
  return shell.deletedAt === null && shell.archivedAt === null;
}

type WatcherCacheEntry = {
  readonly shell: EnvironmentThreadShell;
  readonly facts: T3TeamThreadFacts | undefined;
  readonly link: ThreadPullRequestLink;
  readonly watcher: WatchedPullRequestWatcher;
};

/**
 * What the last derivation produced, so the next one reuses watcher objects and per-key arrays
 * whose inputs did not change. Shells and facts tick often (every activity label); without this
 * every indicator on screen would re-render on each tick.
 */
export type WatchedPullRequestsCache = {
  readonly entries: ReadonlyMap<string, WatcherCacheEntry>;
  readonly byKey: WatchedPullRequestsByKey;
};

function sameWatchers(
  left: ReadonlyArray<WatchedPullRequestWatcher>,
  right: ReadonlyArray<WatchedPullRequestWatcher>,
): boolean {
  return left.length === right.length && left.every((watcher, index) => watcher === right[index]);
}

/** Every watched open link in the environment, keyed by `threadPullRequestKeyOf`. */
export function collectWatchedPullRequests(
  shells: ReadonlyArray<EnvironmentThreadShell>,
  facts: T3TeamThreadFactsByThreadId,
  environmentId: EnvironmentId,
  cache?: WatchedPullRequestsCache,
): WatchedPullRequestsCache {
  const entries = new Map<string, WatcherCacheEntry>();
  const byKey = new Map<string, Array<WatchedPullRequestWatcher>>();
  for (const shell of shells) {
    if (shell.environmentId !== environmentId || !isLiveShell(shell)) continue;
    for (const link of visibleThreadPullRequests(shell.pullRequests)) {
      if (!isWatchedOpenLink(link)) continue;
      const key = threadPullRequestKeyOf(link);
      const entryKey = `${shell.id}\u0000${key}`;
      const threadFacts = facts.get(shell.id);
      const previous = cache?.entries.get(entryKey);
      const watcher =
        previous !== undefined &&
        previous.shell === shell &&
        previous.facts === threadFacts &&
        previous.link === link
          ? previous.watcher
          : buildWatcher(shell, threadFacts, link);
      entries.set(entryKey, { shell, facts: threadFacts, link, watcher });
      const watchers = byKey.get(key) ?? [];
      watchers.push(watcher);
      byKey.set(key, watchers);
    }
  }
  if (byKey.size === 0) {
    return { entries, byKey: EMPTY_WATCHED_PULL_REQUESTS };
  }
  let unchanged = cache !== undefined && cache.byKey.size === byKey.size;
  const stable = new Map<string, ReadonlyArray<WatchedPullRequestWatcher>>();
  for (const [key, watchers] of byKey) {
    watchers.sort((left, right) => TONE_RANK[right.tone] - TONE_RANK[left.tone]);
    const before = cache?.byKey.get(key);
    if (before !== undefined && sameWatchers(before, watchers)) {
      stable.set(key, before);
    } else {
      stable.set(key, watchers);
      unchanged = false;
    }
  }
  return { entries, byKey: unchanged && cache !== undefined ? cache.byKey : stable };
}

/** The one tone the indicator paints when several threads watch the same pull request. */
export function resolveIndicatorTone(
  watchers: ReadonlyArray<Pick<WatchedPullRequestWatcher, "tone">>,
): WatchedPullRequestTone {
  let tone: WatchedPullRequestTone = "quiet";
  for (const watcher of watchers) {
    if (TONE_RANK[watcher.tone] > TONE_RANK[tone]) tone = watcher.tone;
  }
  return tone;
}
