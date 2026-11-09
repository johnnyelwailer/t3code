/**
 * Data for the view-tab stories: a German-named Jira project, its tickets, and a mock backend that
 * answers the digest, the project issue list and the ticket detail. Everything above the backend
 * seam is the production code.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  ProjectShellProjectId,
  type ExternalResourceRef,
  type ProjectShellProject,
} from "@t3tools/project-context";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type {
  MyWorkDigestPayload,
  MyWorkDigestPollFn,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { T3TeamProjectIssuesResult } from "~/t3team/backend/t3team-projectIssuesBackend";
import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";
import type { BackendApi } from "~/t3team/backend/t3team-types";

export const STORY_ENVIRONMENT_ID = EnvironmentId.make("story-env");
export const STORY_THREAD_REF = scopeThreadRef(STORY_ENVIRONMENT_ID, ThreadId.make("story-thread"));
export const STORY_VIEWER = "Philip Jonientz";
const STORY_NOW = "2026-11-06T08:30:00.000Z";

export type StoryTicket = {
  readonly id: string;
  readonly displayId: string;
  readonly title: string;
  readonly status: string;
};

export const TICKET_4711: StoryTicket = {
  id: "10471",
  displayId: "NX-4711",
  title: "Rechnungsfreigabe für Lieferantenverträge mit abweichender Zahlungsfrist überarbeiten",
  status: "In Progress",
};

export const TICKET_4788: StoryTicket = {
  id: "10488",
  displayId: "NX-4788",
  title: "Mahnwesen: Eskalationsstufen für überfällige Gutschriften der Kantonsverwaltung",
  status: "In Review",
};

const STORY_TICKETS: ReadonlyArray<StoryTicket> = [
  TICKET_4711,
  TICKET_4788,
  {
    id: "10502",
    displayId: "NX-4802",
    title: "Zahlungsavis automatisch dem Kreditorenbeleg zuordnen",
    status: "To Do",
  },
];

export type StoryBackendMode = "ready" | "loading" | "error" | "empty";

export function storyProject(slug: string): ProjectShellProject {
  return {
    id: ProjectShellProjectId.make(`story-${slug}`),
    title: "Lieferantenportal – Rechnungsfreigabe und Zahlungsabwicklung Zentralschweiz",
    source: {
      provider: "atlassian",
      accountId: "acct-story",
      externalProjectId: `NX${slug.toUpperCase()}`,
      raw: {},
    },
    workspace: { rootPath: "/tmp/story-lieferantenportal", createdAt: STORY_NOW },
    createdAt: STORY_NOW,
    updatedAt: STORY_NOW,
  };
}

function digestPayload(project: ProjectShellProject, empty: boolean): MyWorkDigestPayload {
  return {
    scope: "project",
    viewer: { name: STORY_VIEWER },
    projects: [
      {
        project: { id: project.source.externalProjectId ?? "", name: project.title },
        tickets: empty
          ? []
          : STORY_TICKETS.map((ticket) => ({
              ...ticket,
              provider: "atlassian",
              kind: "issue",
              url: `https://example.atlassian.net/browse/${ticket.displayId}`,
              projectId: project.source.externalProjectId,
              assignee: STORY_VIEWER,
              updatedAt: STORY_NOW,
            })),
        claims: [],
        decisions: [],
        changeRequests: [],
        transitions: [],
      },
    ],
  };
}

function ticketRef(project: ProjectShellProject, ticket: StoryTicket): ExternalResourceRef {
  return {
    provider: "atlassian",
    kind: "issue",
    id: ticket.id,
    displayId: ticket.displayId,
    title: ticket.title,
    url: `https://example.atlassian.net/browse/${ticket.displayId}`,
    ...(project.source.externalProjectId ? { projectId: project.source.externalProjectId } : {}),
    status: ticket.status,
    priority: "High",
    assignee: STORY_VIEWER,
    updatedAt: STORY_NOW,
  };
}

function refId(ref: unknown): string | null {
  return typeof ref === "object" && ref !== null && "id" in ref && typeof ref.id === "string"
    ? ref.id
    : null;
}

const NEVER = new Promise<never>(() => undefined);

/** The production mock backend with this project's Jira answers swapped in at the seam. */
export function createViewTabsBackend(
  project: ProjectShellProject,
  mode: StoryBackendMode,
): BackendApi {
  const mock = createMockBackend();
  const refs = STORY_TICKETS.map((ticket) => ticketRef(project, ticket));
  const pollMyWorkDigest: MyWorkDigestPollFn = async () => {
    if (mode === "loading") return NEVER;
    if (mode === "error") throw new Error("Request to /api/t3team/mywork-digest failed.");
    const value = digestPayload(project, mode === "empty");
    return { unchanged: false, fingerprint: `story:${mode}`, value };
  };
  const getResource: AtlassianBackendApi["getResource"] = async (request) => {
    const id = refId(request.ref);
    const ref = refs.find((candidate) => candidate.id === id);
    if (!ref) throw new Error(`Issue ${id ?? "?"} does not exist or you cannot see it.`);
    return {
      ref,
      fetchedAt: STORY_NOW,
      fields: {
        status: ref.status,
        priority: ref.priority,
        assignee: ref.assignee,
        description:
          "Die Freigabe muss die vertraglich vereinbarte Zahlungsfrist berücksichtigen, auch wenn sie vom Standard des Kantons abweicht.",
      },
    };
  };
  const listProjectIssues = async (): Promise<T3TeamProjectIssuesResult> => ({
    page: { items: refs },
    source: "mirror",
  });
  return {
    ...mock,
    atlassian: Object.assign(
      { ...mock.atlassian, getResource },
      { listProjectIssues, pollMyWorkDigest },
    ),
  };
}
