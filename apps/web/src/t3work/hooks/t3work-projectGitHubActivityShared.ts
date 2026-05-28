import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";

export type ProjectGitHubActivityCache = {
  readonly host: string;
  readonly account?: string;
  readonly warning?: string;
  readonly suggestedRepositoryCount: number;
  readonly activityItems: ReadonlyArray<GitHubWorkActivityItem>;
};

export function areGitHubActivityItemsEqual(
  left: ReadonlyArray<GitHubWorkActivityItem>,
  right: ReadonlyArray<GitHubWorkActivityItem>,
): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const other = right[index];
    return (
      item.id === other?.id &&
      item.repository === other?.repository &&
      item.reason === other?.reason &&
      item.updatedAt === other?.updatedAt &&
      item.subjectState === other?.subjectState &&
      item.workItemKey === other?.workItemKey
    );
  });
}
