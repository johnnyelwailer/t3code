import { describe, expect, it } from "vitest";
import type { ProjectShellProject } from "@t3tools/project-context";

import { buildTicketSidebarPinnedItem } from "~/t3work/t3work-sidebarPinningTypes";
import type { Project } from "~/types";
import type { ProjectThread, ProjectTicket } from "~/t3work/t3work-types";
import {
  resolveProjectSidebarPinnedItems,
  resolveProjectSidebarPinnedProjectIds,
} from "./t3work-useProjectSidebarPinnedItems";

function createTicket(): ProjectTicket {
  return {
    id: "ticket-1",
    projectId: "project-1",
    ref: {
      provider: "jira",
      kind: "issue",
      id: "10001",
      displayId: "PROJ-1",
      title: "Investigate pinned activity behavior",
      url: "https://example.test/PROJ-1",
      projectId: "project-1",
    },
    status: "In Progress",
    updatedAt: "2026-05-26T12:00:00.000Z",
  };
}

function createThread(overrides?: Partial<ProjectThread>): ProjectThread {
  return {
    id: "thread-1",
    projectId: "project-1",
    ticketId: "ticket-1",
    ticketDisplayId: "PROJ-1",
    title: "Investigate pinned activity behavior",
    status: "idle",
    lastMessageAt: "2026-05-26T12:00:00.000Z",
    messageCount: 2,
    createdAt: "2026-05-26T11:00:00.000Z",
    ...overrides,
  };
}

describe("resolveProjectSidebarPinnedItems", () => {
  it("does not surface ticket-backed session threads without an explicit pin", () => {
    const ticket = createTicket();
    const thread = createThread();

    const resolvedItems = resolveProjectSidebarPinnedItems({
      projectId: "project-1",
      pinnedSidebarItems: [],
      ticketLookup: new Map([[ticket.id, ticket]]),
      ticketThreadsById: new Map([
        [
          ticket.id,
          {
            ticketId: ticket.id,
            ticketDisplayId: ticket.ref.displayId,
            title: thread.title,
            ticketThreads: [thread],
          },
        ],
      ]),
      githubActivityById: new Map(),
    });

    expect(resolvedItems).toEqual([]);
  });

  it("does not duplicate explicit Jira pins that already have ticket-backed session threads", () => {
    const ticket = createTicket();
    const thread = createThread({ id: "thread-2", lastMessageAt: "2026-05-26T13:00:00.000Z" });
    const explicitPin = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: ticket.id,
      pinnedAt: "2026-05-26T10:00:00.000Z",
    });

    const resolvedItems = resolveProjectSidebarPinnedItems({
      projectId: "project-1",
      pinnedSidebarItems: [explicitPin],
      ticketLookup: new Map([[ticket.id, ticket]]),
      ticketThreadsById: new Map([
        [
          ticket.id,
          {
            ticketId: ticket.id,
            ticketDisplayId: ticket.ref.displayId,
            title: thread.title,
            ticketThreads: [thread],
          },
        ],
      ]),
      githubActivityById: new Map(),
    });

    expect(resolvedItems).toEqual([
      {
        kind: "jira-work-item",
        pinnedItem: explicitPin,
        ticket,
        ticketThreads: [thread],
      },
    ]);
  });

  it("resolves and deduplicates pins saved under a live project alias", () => {
    const ticket = {
      ...createTicket(),
      projectId: "stored-project",
      ref: {
        ...createTicket().ref,
        projectId: "stored-project",
      },
    };
    const livePin = buildTicketSidebarPinnedItem({
      projectId: "live-project",
      ticketId: ticket.id,
      pinnedAt: "2026-05-26T11:00:00.000Z",
    });
    const storedPin = buildTicketSidebarPinnedItem({
      projectId: "stored-project",
      ticketId: ticket.id,
      pinnedAt: "2026-05-26T10:00:00.000Z",
    });

    const resolvedItems = resolveProjectSidebarPinnedItems({
      projectId: "stored-project",
      projectIdAliases: ["live-project"],
      pinnedSidebarItems: [livePin, storedPin],
      ticketLookup: new Map([[ticket.id, ticket]]),
      ticketThreadsById: new Map(),
      githubActivityById: new Map(),
    });

    expect(resolvedItems).toEqual([
      {
        kind: "jira-work-item",
        pinnedItem: livePin,
        ticket,
        ticketThreads: [],
      },
    ]);
  });

  it("includes the stored project alias when the sidebar row is using the live project id", () => {
    const project = {
      id: "live-project",
      title: "Alpha",
      source: { provider: "local", raw: {} },
      workspace: { rootPath: "/workspace/alpha", createdAt: "2026-05-27T09:00:00.000Z" },
      createdAt: "2026-05-27T09:00:00.000Z",
      updatedAt: "2026-05-27T09:00:00.000Z",
    } as ProjectShellProject;
    const storedProject = {
      ...project,
      id: "stored-project",
      source: { provider: "local", raw: {} },
    } as ProjectShellProject;
    const liveProjects = [
      {
        id: "live-project",
        cwd: "/workspace/alpha",
        repositoryIdentity: { rootPath: "/workspace/alpha" },
      } as Project,
    ];

    expect(
      resolveProjectSidebarPinnedProjectIds({
        project,
        storedProjects: [storedProject],
        liveProjects,
      }),
    ).toEqual(["live-project", "stored-project"]);
  });
});
