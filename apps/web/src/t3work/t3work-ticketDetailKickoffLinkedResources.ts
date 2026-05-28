import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { RelationshipKeyGroups } from "~/t3work/t3work-ticketRelationshipKeys";
import type { ProjectTicket } from "~/t3work/t3work-types";

import type { T3workSidecarRecipeLinkedResource } from "~/t3work/t3work-sidecarRecipes";

function isPullRequestActivity(item: GitHubWorkActivityItem): boolean {
  return (item.subjectType ?? "").trim().toLowerCase() === "pullrequest";
}

function findRelatedTicket(
  relatedTickets: ReadonlyArray<ProjectTicket>,
  key: string,
): ProjectTicket | undefined {
  return relatedTickets.find(
    (ticket) => ticket.id === key || ticket.ref.id === key || ticket.ref.displayId === key,
  );
}

export function buildTicketLinkedResources(input: {
  relatedTickets: ReadonlyArray<ProjectTicket>;
  ticketRelationshipKeys: RelationshipKeyGroups;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
}): ReadonlyArray<T3workSidecarRecipeLinkedResource> {
  const resources: T3workSidecarRecipeLinkedResource[] = [];
  const seen = new Set<string>();

  const pushJiraResource = (key: string, relationship: string) => {
    const ticket = findRelatedTicket(input.relatedTickets, key);
    const dedupeKey = `jira:${relationship}:${key}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    resources.push({
      kind: "jira.issue",
      id: key,
      provider: "jira",
      label: key,
      ...(ticket ? { title: ticket.ref.title } : {}),
      ...(ticket?.ref.url ? { url: ticket.ref.url } : {}),
      raw: {
        relationship,
        ...(ticket?.issueType ? { issueType: ticket.issueType } : {}),
        ...(ticket?.status ? { status: ticket.status } : {}),
        ...(ticket?.priority ? { priority: ticket.priority } : {}),
      },
    });
  };

  if (input.ticketRelationshipKeys.parentKey) {
    pushJiraResource(input.ticketRelationshipKeys.parentKey, "parent");
  }
  for (const childKey of input.ticketRelationshipKeys.childKeys) {
    pushJiraResource(childKey, "child");
  }
  for (const issueLink of input.ticketRelationshipKeys.issueLinks) {
    pushJiraResource(issueLink.key, issueLink.relation);
  }
  for (const item of input.githubActivityItems) {
    const dedupeKey = `github:${item.id}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    resources.push({
      kind: isPullRequestActivity(item) ? "github.pull-request" : "github.activity",
      id: item.id,
      provider: "github",
      ...(item.repository ? { label: item.repository } : {}),
      ...(item.subjectTitle ? { title: item.subjectTitle } : {}),
      ...(item.subjectUrl ? { url: item.subjectUrl } : {}),
      raw: {
        ...(item.subjectState ? { state: item.subjectState } : {}),
        ...(typeof item.reviewRequested === "boolean"
          ? { reviewRequested: item.reviewRequested }
          : {}),
        ...(typeof item.commentCount === "number" ? { commentCount: item.commentCount } : {}),
        ...(typeof item.reviewCommentCount === "number"
          ? { reviewCommentCount: item.reviewCommentCount }
          : {}),
        ...(item.repository ? { repository: item.repository } : {}),
        ...(item.reason ? { reason: item.reason } : {}),
        ...(item.authorLogin ? { authorLogin: item.authorLogin } : {}),
      },
    });
  }

  return resources;
}
