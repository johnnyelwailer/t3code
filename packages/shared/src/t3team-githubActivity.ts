/**
 * Association, sorting, and grouping logic for "which tracker work item does this GitHub
 * pull request/notification belong to."
 *
 * This used to live only in `apps/web/src/t3team/t3team-githubActivity.ts`, which meant the
 * association only ever happened once a human opened a ticket in the browser: the web app fetched
 * the raw GitHub items, then ran this logic client-side. But `apps/server` is what actually talks
 * to `gh` and fetches the pull requests in the first place (see
 * `apps/server/src/t3team-github-routes-linked-prs.ts`), so anything running server-side — a
 * headless orchestration run, a scheduled job, an agent with no UI — had no way to resolve the
 * same association, because the logic never ran outside the browser.
 *
 * Moving the pure functions here lets the server stamp `workItemKey` onto each item itself, before
 * a response ever reaches a browser, while the web app keeps calling the exact same functions (it
 * re-exports them from its original module so its many existing importers see no change). This
 * mirrors how `git.ts`, `searchRanking.ts`, and `sourceControl.ts` already live in this package for
 * the same reason: pure logic both `apps/server` and `apps/web` need, with no React, no fetch, no
 * DOM, and no browser globals.
 */

/** Matches a tracker key like `IES-9242`: a project prefix followed by `-` and a number. */
export function extractWorkItemKey(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const match = input.toUpperCase().match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  return match ? match[1] : undefined;
}

export function normalizeWorkItemKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

/** The fields a GitHub item can carry a work-item key in, tried in this precedence order. */
export type GitHubWorkItemAssociationSource = {
  readonly subjectTitle?: string;
  readonly subjectBranch?: string;
  readonly repository: string;
};

/**
 * Resolves the tracker key associated with one GitHub item, trying the PR/notification title
 * first, then the branch name, then the repository name — in that order, because a title is the
 * most deliberate signal a human left, while a repository name is the weakest (many work items can
 * share one repository). Both the web view-model mapper and the server's linked-PR route call this
 * one function so the precedence can never drift between the two callers.
 */
export function resolveGitHubWorkItemKey(
  source: GitHubWorkItemAssociationSource,
): string | undefined {
  return normalizeWorkItemKey(
    extractWorkItemKey(source.subjectTitle) ??
      extractWorkItemKey(source.subjectBranch) ??
      extractWorkItemKey(source.repository) ??
      undefined,
  );
}

/** The fields `sortGitHubActivityItems`/grouping need — any richer item shape (the web view-model,
 * a server inbox item with a stamped `workItemKey`) structurally satisfies this. */
export type GitHubWorkItemGroupable = {
  readonly id: string;
  readonly subjectType?: string;
  readonly subjectState?: "open" | "closed" | "merged" | "draft";
  readonly reviewRequested?: boolean;
  readonly updatedAt?: string;
  readonly workItemKey?: string;
};

function isPullRequestActivity(item: GitHubWorkItemGroupable): boolean {
  return (item.subjectType ?? "").trim().toLowerCase() === "pullrequest";
}

function isUnmergedPullRequestActivity(item: GitHubWorkItemGroupable): boolean {
  if (!isPullRequestActivity(item)) return false;
  const state = item.subjectState;
  return state === "open" || state === "draft" || state === undefined;
}

/**
 * Ranks unmerged pull requests first, then any pull request, then anything the viewer was
 * explicitly asked to review, then most-recently-updated, with the item id as a stable tie-break.
 */
export function sortGitHubActivityItems<T extends GitHubWorkItemGroupable>(
  items: ReadonlyArray<T>,
): ReadonlyArray<T> {
  return [...items].sort((left, right) => {
    const leftIsUnmergedPr = isUnmergedPullRequestActivity(left);
    const rightIsUnmergedPr = isUnmergedPullRequestActivity(right);
    if (leftIsUnmergedPr !== rightIsUnmergedPr) {
      return leftIsUnmergedPr ? -1 : 1;
    }

    const leftIsPr = isPullRequestActivity(left);
    const rightIsPr = isPullRequestActivity(right);
    if (leftIsPr !== rightIsPr) {
      return leftIsPr ? -1 : 1;
    }

    const leftReviewRequested = left.reviewRequested === true;
    const rightReviewRequested = right.reviewRequested === true;
    if (leftReviewRequested !== rightReviewRequested) {
      return leftReviewRequested ? -1 : 1;
    }

    const leftUpdatedAt = left.updatedAt ? Date.parse(left.updatedAt) : Number.NaN;
    const rightUpdatedAt = right.updatedAt ? Date.parse(right.updatedAt) : Number.NaN;
    const leftUpdatedAtSafe = Number.isFinite(leftUpdatedAt) ? leftUpdatedAt : 0;
    const rightUpdatedAtSafe = Number.isFinite(rightUpdatedAt) ? rightUpdatedAt : 0;
    if (leftUpdatedAtSafe !== rightUpdatedAtSafe) {
      return rightUpdatedAtSafe - leftUpdatedAtSafe;
    }

    return left.id.localeCompare(right.id);
  });
}

/** Groups already-associated items by their (case-normalized) `workItemKey`, sorting each group
 * with {@link sortGitHubActivityItems}. Items without a resolvable key are dropped. */
export function groupGitHubActivityByWorkItem<T extends GitHubWorkItemGroupable>(
  items: ReadonlyArray<T>,
): ReadonlyMap<string, ReadonlyArray<T>> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const workItemKey = normalizeWorkItemKey(item.workItemKey);
    if (!workItemKey) continue;
    const existing = map.get(workItemKey) ?? [];
    existing.push(item);
    map.set(workItemKey, existing);
  }
  for (const [workItemKey, groupedItems] of map) {
    map.set(workItemKey, [...sortGitHubActivityItems(groupedItems)]);
  }
  return map;
}

export function getGitHubActivityItemsForWorkItem<T extends GitHubWorkItemGroupable>(
  itemsByWorkItem: ReadonlyMap<string, ReadonlyArray<T>>,
  workItemKey: string | undefined,
): ReadonlyArray<T> {
  const normalizedWorkItemKey = normalizeWorkItemKey(workItemKey);
  if (!normalizedWorkItemKey) {
    return [];
  }

  return itemsByWorkItem.get(normalizedWorkItemKey) ?? [];
}
