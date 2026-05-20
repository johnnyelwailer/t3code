import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";

function formatReason(reason: string): string {
  return reason.replaceAll("_", " ");
}

function classifyActivity(item: GitHubWorkActivityItem): {
  kind: string;
  label: string;
} {
  const subjectType = (item.subjectType ?? "").toLowerCase();
  if (subjectType === "pullrequest") {
    if (item.subjectState === "merged")
      return { kind: "github-activity-pr-merged", label: "Merged PR" };
    if (item.subjectState === "open") return { kind: "github-activity-pr-open", label: "Open PR" };
    if (item.subjectState === "closed")
      return { kind: "github-activity-pr-closed", label: "Closed PR" };
    if (item.subjectState === "draft")
      return { kind: "github-activity-pr-draft", label: "Draft PR" };
    if (item.reviewRequested)
      return { kind: "github-activity-review-requested", label: "PR review requested" };
    return { kind: "github-activity-pr", label: "Pull request" };
  }

  const reason = item.reason.toLowerCase();
  if (reason.includes("review"))
    return { kind: "github-activity-review-requested", label: "Review activity" };
  if (reason.includes("comment") || reason.includes("mention"))
    return { kind: "github-activity-comment", label: "Comment activity" };
  if (reason.includes("workflow"))
    return { kind: "github-activity-workflow", label: "Workflow activity" };
  return { kind: "github-activity", label: "GitHub activity" };
}

export function buildGitHubActivityDisplay(input: { item: GitHubWorkActivityItem }): {
  activityKind: string;
  targetLabel: string;
  targetType: string;
  summaryItems: ReadonlyArray<{ label: string; value: string }>;
} {
  const { item } = input;
  const classification = classifyActivity(item);
  const subject = item.subjectTitle ?? item.repository;
  return {
    activityKind: classification.kind,
    targetLabel: `${classification.label}: ${subject}`,
    targetType: `GitHub ${classification.label}`,
    summaryItems: [
      { label: "Activity", value: classification.label },
      { label: "Repository", value: item.repository },
      { label: "Reason", value: formatReason(item.reason) },
      ...(item.authorLogin ? [{ label: "Author", value: item.authorLogin }] : []),
      ...(item.subjectState ? [{ label: "State", value: item.subjectState }] : []),
      ...(typeof item.changedFiles === "number"
        ? [{ label: "Changed files", value: String(item.changedFiles) }]
        : []),
      ...(typeof item.additions === "number" || typeof item.deletions === "number"
        ? [
            {
              label: "Diff stats",
              value: `+${String(item.additions ?? 0)} / -${String(item.deletions ?? 0)}`,
            },
          ]
        : []),
      ...(typeof item.reviewCommentCount === "number"
        ? [{ label: "Review comments", value: String(item.reviewCommentCount) }]
        : []),
    ],
  };
}
