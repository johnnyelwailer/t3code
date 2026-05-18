import type { ProjectShellProject } from "@t3tools/project-context";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { ComprehensiveTicketPayload } from "~/t3work/t3work-addToChatPayloadBuilders";

type T3WorkDirectoryBundlePayload = {
  kind: "t3work-directory-bundle";
  dedupeKey: string;
  bundleRootRelativePath: string;
  files: ReadonlyArray<{ relativePath: string; contents: string }>;
  fileReferences: ReadonlyArray<{ label: string; relativePath: string }>;
  lightweightItem: unknown;
};

function sanitizePathSegment(input: string): string {
  const value = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return value.length > 0 ? value.slice(0, 80) : "item";
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

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
    if (item.reviewRequested) {
      return { kind: "github-activity-review-requested", label: "PR review requested" };
    }
    return { kind: "github-activity-pr", label: "Pull request" };
  }

  const reason = item.reason.toLowerCase();
  if (reason.includes("review")) {
    return { kind: "github-activity-review-requested", label: "Review activity" };
  }
  if (reason.includes("comment") || reason.includes("mention")) {
    return { kind: "github-activity-comment", label: "Comment activity" };
  }
  if (reason.includes("workflow")) {
    return { kind: "github-activity-workflow", label: "Workflow activity" };
  }
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
    ],
  };
}

export function buildGitHubActivityContextBundle(input: {
  project: ProjectShellProject;
  item: GitHubWorkActivityItem;
  linkedWorkItem?: ProjectTicket | null;
  linkedTicketContext?: ComprehensiveTicketPayload;
}): T3WorkDirectoryBundlePayload {
  const display = buildGitHubActivityDisplay({ item: input.item });
  const root = `.t3work/context-cache/github/${sanitizePathSegment(input.project.id)}/${sanitizePathSegment(
    input.item.repository,
  )}/${sanitizePathSegment(input.item.id)}`;
  const files: Array<{ relativePath: string; contents: string }> = [];
  const fileReferences: Array<{ label: string; relativePath: string }> = [];

  const write = (label: string, relativePath: string, value: unknown) => {
    files.push({ relativePath, contents: stringify(value) });
    fileReferences.push({ label, relativePath });
  };

  write("Manifest", `${root}/manifest.json`, {
    kind: "github-activity-context-manifest",
    generatedAt: new Date().toISOString(),
    activityKind: display.activityKind,
    activityLabel: display.targetType,
    activityId: input.item.id,
    references: {
      activity: `${root}/activity/item.json`,
      repository: `${root}/repository/context.json`,
      project: `${root}/project/context.json`,
      linkedWorkItem: `${root}/linked-work-item/context.json`,
      linkedWorkItemFullContext: `${root}/linked-work-item/full-ticket-context.json`,
    },
  });

  write("Activity item", `${root}/activity/item.json`, {
    activityKind: display.activityKind,
    item: input.item,
  });
  write("Repository context", `${root}/repository/context.json`, {
    repository: input.item.repository,
    ...(input.item.repositoryUrl ? { repositoryUrl: input.item.repositoryUrl } : {}),
  });
  write("Project context", `${root}/project/context.json`, {
    id: input.project.id,
    title: input.project.title,
    source: input.project.source,
    ...(input.project.workspace?.rootPath
      ? { workspaceRoot: input.project.workspace.rootPath }
      : {}),
  });
  write("Linked work item", `${root}/linked-work-item/context.json`, {
    linkedWorkItem: input.linkedWorkItem ?? null,
  });
  if (input.linkedTicketContext) {
    write("Linked work item full context", `${root}/linked-work-item/full-ticket-context.json`, {
      ticketContext: input.linkedTicketContext,
    });
  }

  return {
    kind: "t3work-directory-bundle",
    dedupeKey: `${input.project.id}:github-activity:${input.item.id}`,
    bundleRootRelativePath: root,
    files,
    fileReferences,
    lightweightItem: {
      kind: display.activityKind,
      label: display.targetLabel,
      summaryItems: display.summaryItems,
      references: [
        { label: "Manifest", relativePath: `${root}/manifest.json` },
        { label: "Activity item", relativePath: `${root}/activity/item.json` },
      ],
    },
  };
}
