import {
  CheckCircleFillIcon,
  CodeReviewIcon,
  CommentDiscussionIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  MarkGithubIcon,
} from "@primer/octicons-react";
import type { ComponentType } from "react";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";

export type GitHubActivityVisual = {
  Icon: ComponentType<{ className?: string }>;
  iconClassName: string;
};

export function getGitHubActivityVisual(item: GitHubWorkActivityItem): GitHubActivityVisual {
  if (item.subjectState === "merged")
    return { Icon: GitMergeIcon, iconClassName: "text-violet-500" };
  if (item.subjectState === "closed") {
    return { Icon: GitPullRequestClosedIcon, iconClassName: "text-red-500" };
  }
  if (item.subjectState === "draft") {
    return { Icon: GitPullRequestDraftIcon, iconClassName: "text-amber-500" };
  }
  if (item.subjectState === "open")
    return { Icon: GitPullRequestIcon, iconClassName: "text-emerald-500" };

  const reason = item.reason.toLowerCase();
  const title = (item.subjectTitle ?? "").toLowerCase();
  const isPullRequest = (item.subjectType ?? "").toLowerCase() === "pullrequest";

  if (isPullRequest && (reason.includes("merged") || title.includes("merged"))) {
    return { Icon: GitMergeIcon, iconClassName: "text-violet-500" };
  }
  if (isPullRequest && (reason.includes("closed") || title.includes("closed"))) {
    return { Icon: GitPullRequestClosedIcon, iconClassName: "text-red-500" };
  }
  if (reason.includes("review")) return { Icon: CodeReviewIcon, iconClassName: "text-blue-500" };
  if (reason.includes("approved")) {
    return { Icon: CheckCircleFillIcon, iconClassName: "text-emerald-500" };
  }
  if (reason.includes("comment") || reason.includes("mention")) {
    return { Icon: CommentDiscussionIcon, iconClassName: "text-sky-500" };
  }
  if (isPullRequest) return { Icon: GitPullRequestIcon, iconClassName: "text-emerald-500" };
  return { Icon: MarkGithubIcon, iconClassName: "text-muted-foreground" };
}

export function renderRelativeUpdatedAt(updatedAt: string | undefined): string | undefined {
  if (!updatedAt) return undefined;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  const deltaMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function formatPullRequestState(
  state: GitHubWorkActivityItem["subjectState"],
): string | undefined {
  if (!state) return undefined;
  if (state === "open") return "PR open";
  if (state === "closed") return "PR closed";
  if (state === "merged") return "PR merged";
  if (state === "draft") return "PR draft";
  return undefined;
}

export function pullRequestStateClass(
  state: GitHubWorkActivityItem["subjectState"],
): string | undefined {
  if (!state) return undefined;
  if (state === "open") return "bg-emerald-500/12 text-emerald-300 border-emerald-500/30";
  if (state === "closed") return "bg-red-500/12 text-red-300 border-red-500/30";
  if (state === "merged") return "bg-violet-500/12 text-violet-300 border-violet-500/30";
  if (state === "draft") return "bg-amber-500/12 text-amber-300 border-amber-500/30";
  return undefined;
}

export function reviewRequestedClass(item: GitHubWorkActivityItem): string | undefined {
  const isPullRequest = (item.subjectType ?? "").toLowerCase() === "pullrequest";
  if (!isPullRequest || !item.reviewRequested) return undefined;
  return "bg-sky-500/12 text-sky-300 border-sky-500/30";
}

export function isRedundantPullRequestReason(item: GitHubWorkActivityItem): boolean {
  const reason = item.reason.trim().toLowerCase().replaceAll("_", " ");
  const isPullRequest = (item.subjectType ?? "").toLowerCase() === "pullrequest";
  return isPullRequest && reason === "pull request";
}
