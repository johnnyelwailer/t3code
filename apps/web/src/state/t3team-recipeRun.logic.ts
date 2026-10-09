/**
 * Which thread is "the recipe's run in this project", and which threads it watches with
 * (doc 07 §2.5). The home thread is found by the host's launch fact (`t3team.recipe`); the watch
 * threads by the host's launched-by fact (`t3team.launchedBy`, scope `recipe:<id>`). Both are
 * host-written, so the card never guesses from titles.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { T3TeamThreadFactsByThreadId } from "@t3tools/client-runtime/state/thread-facts";
import {
  readT3TeamLaunchedByFact,
  readT3TeamRecipeLaunchFact,
  readT3TeamRecipeSummaryFact,
  type EnvironmentId,
  type OrchestrationWorkflowRunStatus,
  type ScopedThreadRef,
  type T3TeamRecipeSummaryFact,
} from "@t3tools/contracts";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/shared/threadPullRequests";

import {
  buildWatcher,
  isLiveShell,
  type WatchedPullRequestWatcher,
} from "./t3team-watchedPullRequests.logic";

export type RecipeRunHomeThread = {
  readonly threadRef: ScopedThreadRef;
  readonly title: string;
  readonly workflowRunStatus: OrchestrationWorkflowRunStatus | null;
  /** When the host launched this run (`t3team.recipe.launchedAt`). */
  readonly launchedAt: string;
  /** The run's live label while a pass runs ("finding your PRs on 3 repos…"). */
  readonly activityLabel: string | null;
  readonly summary: T3TeamRecipeSummaryFact | null;
};

export type RecipeRunSnapshot = {
  readonly home: RecipeRunHomeThread | null;
  /** The run's watch threads, one per pull request, in the indicator's watcher shape. */
  readonly watchThreads: ReadonlyArray<WatchedPullRequestWatcher>;
};

export const EMPTY_RECIPE_RUN: RecipeRunSnapshot = { home: null, watchThreads: [] };

const ACTIVE_RUN_STATUSES: ReadonlySet<OrchestrationWorkflowRunStatus["status"]> = new Set([
  "authoring",
  "queued",
  "running",
  "suspended",
  "sleeping",
  "watching",
  "paused",
]);

export function isRunActive(status: OrchestrationWorkflowRunStatus | null | undefined): boolean {
  return status !== null && status !== undefined && ACTIVE_RUN_STATUSES.has(status.status);
}

export function collectRecipeRun(
  shells: ReadonlyArray<EnvironmentThreadShell>,
  facts: T3TeamThreadFactsByThreadId,
  scope: {
    environmentId: EnvironmentId;
    projectId: string;
    recipeId: string;
    /** The recipe's summary key; pr-watch's by default. */
    summaryKey?: string;
  },
): RecipeRunSnapshot {
  const launchScope = `recipe:${scope.recipeId}`;
  const launched: Array<{ shell: EnvironmentThreadShell; launchThreadId: string | null }> = [];
  let home: {
    shell: EnvironmentThreadShell;
    status: OrchestrationWorkflowRunStatus | null;
    launchedAt: string;
  } | null = null;
  const watchers: Array<WatchedPullRequestWatcher> = [];
  for (const shell of shells) {
    if (
      shell.environmentId !== scope.environmentId ||
      shell.projectId !== scope.projectId ||
      !isLiveShell(shell)
    ) {
      continue;
    }
    const threadFacts = facts.get(shell.id);
    const launch = readT3TeamRecipeLaunchFact(threadFacts?.extensions);
    if (launch?.id === scope.recipeId) {
      const status = threadFacts?.workflowRunStatus ?? null;
      // An active run wins over a finished one; among equals the latest launch wins.
      const outranks =
        home === null ||
        (isRunActive(status) && !isRunActive(home.status)) ||
        (isRunActive(status) === isRunActive(home.status) && launch.launchedAt > home.launchedAt);
      if (outranks) home = { shell, status, launchedAt: launch.launchedAt };
      continue;
    }
    const launchedBy = readT3TeamLaunchedByFact(threadFacts?.extensions);
    if (launchedBy !== null) launched.push({ shell, launchThreadId: launchedBy.launchThreadId });
  }
  // A thread belongs to the run when its scope names the recipe, or its launch thread is the home.
  for (const { shell, launchThreadId } of launched) {
    const launchedBy = readT3TeamLaunchedByFact(facts.get(shell.id)?.extensions);
    const ofRecipe =
      launchedBy?.scope === launchScope || (home !== null && launchThreadId === home.shell.id);
    if (!ofRecipe) continue;
    const link = resolveThreadCurrentPullRequestLink(shell.pullRequests);
    // A watch thread outlives its pull request (its id derives from the key), so a merged or
    // closed one is history, not a watcher. An unwatched open one stays: that is a parked row.
    if (link === null || (link.snapshot !== null && link.snapshot.state !== "open")) continue;
    watchers.push(buildWatcher(shell, facts.get(shell.id), link));
  }
  if (home === null && watchers.length === 0) return EMPTY_RECIPE_RUN;
  return {
    home:
      home === null
        ? null
        : {
            threadRef: { environmentId: home.shell.environmentId, threadId: home.shell.id },
            title: home.shell.title,
            workflowRunStatus: home.status,
            launchedAt: home.launchedAt,
            activityLabel: facts.get(home.shell.id)?.activityLabel ?? null,
            summary: readT3TeamRecipeSummaryFact(
              facts.get(home.shell.id)?.extensions,
              scope.summaryKey,
            ),
          },
    watchThreads: watchers,
  };
}
