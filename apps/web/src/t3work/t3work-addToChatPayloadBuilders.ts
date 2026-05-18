import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  extractRelationshipKeys,
  normalizeRelationshipKey,
} from "~/t3work/t3work-ticketRelationshipKeys";

export type ComprehensiveTicketPayload = {
  kind: "jira-work-item";
  capturedAt: string;
  project: {
    id: string;
    title: string;
    workspaceRoot?: string;
    source: ProjectShellProject["source"];
  };
  ticket: ProjectTicket;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  relationshipKeys: {
    parentKey?: string;
    childKeys: string[];
    referenceKeys: string[];
  };
  primarySnapshot: ResourceSnapshot | null;
  knownRelatedTickets: ProjectTicket[];
  fetchedRelatedSnapshots: Array<Record<string, unknown>>;
};

function buildTicketLookup(
  projectTickets: ReadonlyArray<ProjectTicket>,
): Map<string, ProjectTicket> {
  const lookup = new Map<string, ProjectTicket>();
  for (const ticket of projectTickets) {
    lookup.set(ticket.id, ticket);
    lookup.set(ticket.ref.id, ticket);
    lookup.set(ticket.ref.displayId, ticket);
  }
  return lookup;
}

async function fetchSnapshotByKey(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  accountId: string;
  externalProjectId: string;
  key: string;
}): Promise<ResourceSnapshot> {
  return input.backend.atlassian.getResource({
    accountId: input.accountId,
    ref: {
      id: input.key,
      provider: input.project.source.provider,
      kind: "issue",
      projectId: input.externalProjectId,
    },
  });
}

export async function buildComprehensiveTicketPayload(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  ticket: ProjectTicket;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  primarySnapshot?: ResourceSnapshot | null;
}): Promise<ComprehensiveTicketPayload> {
  const { backend, project, ticket, projectTickets, githubActivityItems, primarySnapshot } = input;

  const canFetch = Boolean(project.source.accountId && project.source.externalProjectId);
  const accountId = project.source.accountId;
  const externalProjectId = project.source.externalProjectId;
  const snapshot =
    primarySnapshot ??
    (canFetch
      ? await fetchSnapshotByKey({
          backend,
          project,
          accountId: accountId as string,
          externalProjectId: externalProjectId as string,
          key: ticket.ref.id,
        })
      : null);

  const relationshipKeys = snapshot?.raw
    ? extractRelationshipKeys(snapshot.raw)
    : { parentKey: undefined, childKeys: [], referenceKeys: [] };

  const allKeys = new Set<string>();
  if (relationshipKeys.parentKey) allKeys.add(relationshipKeys.parentKey);
  for (const key of relationshipKeys.childKeys) allKeys.add(key);
  for (const key of relationshipKeys.referenceKeys) allKeys.add(key);

  const ignoredKeys = new Set(
    [ticket.id, ticket.ref.id, ticket.ref.displayId]
      .map((value) => normalizeRelationshipKey(value))
      .filter((value): value is string => typeof value === "string"),
  );

  const lookup = buildTicketLookup(projectTickets);
  const knownRelatedTickets: ProjectTicket[] = [];
  const fetchKeys: string[] = [];

  for (const key of allKeys) {
    if (ignoredKeys.has(key)) continue;
    const knownTicket = lookup.get(key);
    if (knownTicket) {
      knownRelatedTickets.push(knownTicket);
      continue;
    }
    fetchKeys.push(key);
  }

  const fetchedRelatedSnapshots: Array<Record<string, unknown>> = [];
  if (canFetch) {
    await Promise.all(
      fetchKeys.map(async (key) => {
        try {
          const relatedSnapshot = await fetchSnapshotByKey({
            backend,
            project,
            accountId: accountId as string,
            externalProjectId: externalProjectId as string,
            key,
          });
          fetchedRelatedSnapshots.push({ key, snapshot: relatedSnapshot });
        } catch (error) {
          fetchedRelatedSnapshots.push({
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }

  return {
    kind: "jira-work-item",
    capturedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      ...(project.workspace?.rootPath ? { workspaceRoot: project.workspace.rootPath } : {}),
      source: project.source,
    },
    ticket,
    githubActivityItems,
    relationshipKeys: {
      ...(relationshipKeys.parentKey ? { parentKey: relationshipKeys.parentKey } : {}),
      childKeys: [...relationshipKeys.childKeys],
      referenceKeys: [...relationshipKeys.referenceKeys],
    },
    primarySnapshot: snapshot,
    knownRelatedTickets,
    fetchedRelatedSnapshots,
  };
}
