import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { TicketContextGraph } from "~/t3team/t3team-ticketContextGraph";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function createProject(): ProjectShellProject {
  return {
    id: "Project Alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "proj-1",
      externalProjectKey: "PROJ",
    },
    workspace: {
      rootPath: "/tmp/project-alpha",
      createdAt: "2026-05-18T00:00:00.000Z",
    },
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };
}

export function createTicket(key: string, title: string): ProjectTicket {
  return {
    id: key.toLowerCase(),
    projectId: "Project Alpha",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: key,
      displayId: key,
      title,
      type: "Task",
      url: `https://example.test/browse/${key}`,
      projectId: "PROJ",
    },
    issueType: "Task",
    status: "In Progress",
    updatedAt: "2026-05-18T12:00:00.000Z",
  };
}

function createSnapshot(key: string, title: string): ResourceSnapshot {
  return {
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: key,
      displayId: key,
      title,
      projectId: "PROJ",
      updatedAt: "2026-05-18T12:00:00.000Z",
    },
    fetchedAt: "2026-05-18T12:34:56.000Z",
    fields: {},
    raw: { fields: {} },
  };
}

export function createSnapshotWithFields(
  key: string,
  title: string,
  fields: Record<string, unknown>,
): ResourceSnapshot {
  return {
    ...createSnapshot(key, title),
    fields,
    raw: { fields },
  };
}

export function createGraph(): TicketContextGraph {
  const rootTicket = createTicket("PROJ-7", "Investigate context sync");
  const childTicket = createTicket("PROJ-8", "Follow up");
  return {
    rootKey: "PROJ-7",
    nodes: new Map([
      [
        "PROJ-7",
        {
          key: "PROJ-7",
          ticket: rootTicket,
          snapshot: createSnapshot("PROJ-7", rootTicket.ref.title),
          relationshipKeys: {
            childKeys: ["PROJ-8"],
            referenceKeys: ["PROJ-9"],
          },
        },
      ],
      [
        "PROJ-8",
        {
          key: "PROJ-8",
          ticket: childTicket,
          snapshot: null,
          relationshipKeys: {
            parentKey: "PROJ-7",
            childKeys: [],
            referenceKeys: [],
          },
        },
      ],
      [
        "PROJ-9",
        {
          key: "PROJ-9",
          ticket: null,
          snapshot: createSnapshot("PROJ-9", "Referenced ticket"),
          relationshipKeys: {
            childKeys: [],
            referenceKeys: [],
          },
        },
      ],
    ]),
  };
}

export const PROJECT = createProject();
export const ROOT_TICKET = createTicket("PROJ-7", "Investigate context sync");
export const BACKEND = {} as BackendApi;
export const GITHUB_ACTIVITY: ReadonlyArray<GitHubWorkActivityItem> = [
  {
    id: "pr-42",
    repository: "example/project-alpha",
    reason: "review_requested",
    subjectType: "PullRequest",
    subjectTitle: "Fix context sync",
    subjectState: "open",
  },
];
