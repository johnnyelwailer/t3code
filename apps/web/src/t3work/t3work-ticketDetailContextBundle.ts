import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { buildComprehensiveTicketPayload } from "~/t3work/t3work-addToChatPayloadBuilders";

export type TicketDetailContextTarget =
  | "metadata"
  | "description"
  | "attachments"
  | "comments"
  | "relationships"
  | "parent";

export type T3WorkDirectoryBundlePayload = {
  kind: "t3work-directory-bundle";
  dedupeKey: string;
  bundleRootRelativePath: string;
  files: ReadonlyArray<{ relativePath: string; contents: string }>;
  fileReferences: ReadonlyArray<{ label: string; relativePath: string }>;
  lightweightItem: unknown;
};

function jiraDetailKind(target: TicketDetailContextTarget): string {
  return `jira-ticket-${target}`;
}

function sanitizePathSegment(input: string): string {
  const value = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return value.length > 0 ? value.slice(0, 80) : "item";
}

function stableTicketCacheRoot(project: ProjectShellProject, ticket: ProjectTicket): string {
  const projectSegment = sanitizePathSegment(project.id);
  const ticketSegment = sanitizePathSegment(ticket.ref.displayId || ticket.ref.id || ticket.id);
  return `.t3work/context-cache/jira/${projectSegment}/${ticketSegment}`;
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export async function buildTicketDetailContextBundle(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  ticket: ProjectTicket;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  target: TicketDetailContextTarget;
  targetLabel: string;
  summaryItems?: ReadonlyArray<{ label: string; value: string }>;
  primarySnapshot?: ResourceSnapshot | null;
}): Promise<T3WorkDirectoryBundlePayload> {
  const comprehensive = await buildComprehensiveTicketPayload({
    backend: input.backend,
    project: input.project,
    ticket: input.ticket,
    projectTickets: input.projectTickets,
    githubActivityItems: input.githubActivityItems,
    ...(input.primarySnapshot !== undefined ? { primarySnapshot: input.primarySnapshot } : {}),
  });

  const root = stableTicketCacheRoot(input.project, input.ticket);
  const files: Array<{ relativePath: string; contents: string }> = [];
  const fileReferences: Array<{ label: string; relativePath: string }> = [];

  const write = (label: string, relativePath: string, value: unknown) => {
    files.push({ relativePath, contents: stringify(value) });
    fileReferences.push({ label, relativePath });
  };

  write("Manifest", `${root}/manifest.json`, {
    kind: "jira-ticket-context-manifest",
    generatedAt: new Date().toISOString(),
    target: input.target,
    targetLabel: input.targetLabel,
    ticketId: input.ticket.id,
    ticketDisplayId: input.ticket.ref.displayId,
    references: {
      ticket: `${root}/ticket.json`,
      relationships: `${root}/relationships.json`,
      githubActivity: `${root}/github-activity.json`,
      relatedKnownTickets: `${root}/related/known-tickets.json`,
      relatedFetchedSnapshots: `${root}/related/fetched-snapshots.json`,
      item: `${root}/items/${input.target}.json`,
    },
  });

  write("Ticket", `${root}/ticket.json`, {
    ticket: comprehensive.ticket,
    primarySnapshot: comprehensive.primarySnapshot,
  });
  write("Relationships", `${root}/relationships.json`, {
    relationshipKeys: comprehensive.relationshipKeys,
  });
  write("GitHub activity", `${root}/github-activity.json`, {
    githubActivityItems: comprehensive.githubActivityItems,
  });
  write("Related known tickets", `${root}/related/known-tickets.json`, {
    knownRelatedTickets: comprehensive.knownRelatedTickets,
  });
  write("Related fetched snapshots", `${root}/related/fetched-snapshots.json`, {
    fetchedRelatedSnapshots: comprehensive.fetchedRelatedSnapshots,
  });

  const itemRelativePath = `${root}/items/${input.target}.json`;
  write("Selected item", itemRelativePath, {
    kind: jiraDetailKind(input.target),
    target: input.target,
    label: input.targetLabel,
    summaryItems: input.summaryItems ?? [],
  });

  return {
    kind: "t3work-directory-bundle",
    dedupeKey: `${input.project.id}:${input.ticket.id}:${input.target}`,
    bundleRootRelativePath: root,
    files,
    fileReferences,
    lightweightItem: {
      kind: jiraDetailKind(input.target),
      target: input.target,
      label: input.targetLabel,
      summaryItems: input.summaryItems ?? [],
      references: [
        { label: "Manifest", relativePath: `${root}/manifest.json` },
        { label: "Ticket", relativePath: `${root}/ticket.json` },
        { label: "Selected item", relativePath: itemRelativePath },
      ],
    },
  };
}
