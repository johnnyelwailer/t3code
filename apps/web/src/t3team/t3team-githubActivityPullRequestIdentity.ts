/**
 * The pull request a GitHub activity item is about, in the indicator's identity shape. Item ids
 * are `host:owner/repo#123` (the host prefix absent on github.com); the number can also sit at
 * the end of the subject URL.
 */
import type { PullRequestIdentity } from "~/state/t3team-watchedPullRequests";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";

const ITEM_ID = /^(?:([^:/#]+):)?([^#]+)#(\d+)$/;

export function pullRequestIdentityOfActivityItem(
  item: Pick<GitHubWorkActivityItem, "id" | "repository" | "subjectType" | "subjectUrl">,
): PullRequestIdentity | null {
  if (item.subjectType !== undefined && item.subjectType !== "PullRequest") return null;
  const match = ITEM_ID.exec(item.id);
  const number = Number(match?.[3] ?? item.subjectUrl?.match(/\/pull\/(\d+)/)?.[1]);
  if (!Number.isInteger(number) || number <= 0) return null;
  let host = match?.[1];
  if (host === undefined && item.subjectUrl) {
    try {
      host = new URL(item.subjectUrl).hostname;
    } catch {
      host = undefined;
    }
  }
  return { host: host ?? null, repository: match?.[2] ?? item.repository, number };
}
