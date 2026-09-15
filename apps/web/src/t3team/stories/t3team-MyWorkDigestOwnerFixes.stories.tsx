/**
 * Stories for the digest's owner fixes (nexplore.ghe.com/pj/nexi-distribution#480):
 * the cold-start "backend starting / retrying" state and its automatic recovery,
 * the full-width layout, the readable data-source status for empty scopes,
 * and the three distinct view lenses.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import type { ProjectShellProject } from "@t3tools/project-context";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import type {
  MyWorkDigestPayload,
  MyWorkDigestPollFn,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { ProjectMyWorkDigestContent } from "~/t3team/t3team-ProjectMyWorkDigestContent";
import { ProjectMyWorkDigestFixtureView } from "~/t3team/t3team-ProjectMyWorkDigestFixtureView";
import { ProjectMyWorkDigestRetryState } from "~/t3team/t3team-ProjectMyWorkDigestRetryState";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  DIGEST_FIXTURE_NOW_MS,
  HOUR,
  iesGraphWithoutSprint,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";
import { heuristicArrangementScenario } from "~/t3team/t3team-projectMyWorkDigestFixtureScenarios";
import { ProjectMyWorkHierarchyView } from "~/t3team/t3team-ProjectMyWorkHierarchyView";
import { ProjectDashboardKanban } from "~/t3team/t3team-ProjectDashboardKanban";
import { buildProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

function createStoryProject(): ProjectShellProject {
  return {
    id: "story-project" as ProjectShellProject["id"],
    title: "IES NG",
    source: {
      provider: "atlassian",
      accountId: "acct-story",
      externalProjectId: "IES",
      raw: {},
    },
    workspace: { rootPath: "/tmp/story-project", createdAt: "2026-09-01T00:00:00.000Z" },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } as ProjectShellProject;
}

const STORY_PROJECT = createStoryProject();

function createStoryPayload(): MyWorkDigestPayload {
  return {
    scope: "project",
    projects: [
      {
        project: { id: "IES", name: "IES NG" },
        tickets: [
          {
            id: "issue-101",
            displayId: "IES-101",
            title: "Wire the new digest receipt path",
            provider: "atlassian",
            kind: "issue",
            url: "https://jira/IES-101",
            projectId: "IES",
            status: "In Progress",
            assignee: "Philip",
            updatedAt: new Date().toISOString(),
          },
        ],
        claims: [],
        decisions: [],
        changeRequests: [],
        transitions: [],
      },
    ],
  };
}

type PollInput = Parameters<MyWorkDigestPollFn>[0];

function createFakeBackend(bootDelayMs: number): BackendApi {
  const upAt = Date.now() + bootDelayMs;
  const poll = async (_input: PollInput) => {
    if (Date.now() < upAt) {
      // The failure a cold start actually produces: the fetch never reaches the route.
      throw new Error(
        "Request to /api/t3team/mywork-digest/graph/poll failed: CORS mismatch or blocked preflight.",
      );
    }
    return {
      unchanged: false,
      fingerprint: "storybook-fixture",
      value: createStoryPayload(),
    };
  };
  return {
    state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
    connect: async () => undefined,
    disconnect: async () => undefined,
    dispatchCommand: async () => undefined,
    listThreadPlacements: async () => [],
    atlassian: { pollMyWorkDigest: (input: PollInput) => poll(input) },
  } as unknown as BackendApi;
}

export function MyWorkDigestColdStartFixture({ bootDelayMs = 4000 }: { bootDelayMs?: number }) {
  // Stable identity: the digest hook must not treat story re-renders as backend changes.
  const [backend] = useState(() => createFakeBackend(bootDelayMs));
  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-7 xl:px-10 2xl:px-14">
      <div className="mx-auto w-full space-y-4">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          The fake backend answers only after {Math.round(bootDelayMs / 1000)} s. The digest opens
          in the &ldquo;backend starting&rdquo; state and recovers on its own once the poll succeeds
          — the raw fetch error never reaches the UI.
        </p>
        <BackendProvider backend={backend}>
          <ProjectMyWorkDigestContent project={STORY_PROJECT} onOpenTicket={() => undefined} />
        </BackendProvider>
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Project Dashboard/My Work Digest — Owner Fixes",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ColdStartRetryingState: Story = {
  render: () => (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-7 xl:px-10 2xl:px-14">
      <div className="mx-auto w-full space-y-4">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          The exact panel shown while the backend is starting up (or a poll round failed): a
          spinner, a human sentence, skeleton rows — and no raw fetch diagnostics.
        </p>
        <ProjectMyWorkDigestRetryState />
      </div>
    </div>
  ),
};

type ColdStartStory = StoryObj<typeof MyWorkDigestColdStartFixture>;

export const ColdStartRecovery: ColdStartStory = {
  args: { bootDelayMs: 4000 },
  argTypes: {
    bootDelayMs: {
      label: "Backend boot delay (ms)",
      type: "number",
      minimum: 0,
      maximum: 30000,
      step: 500,
    },
  },
};

export const FullWidthLayout: Story = {
  render: () => (
    <ProjectMyWorkDigestFixtureView
      scenario={heuristicArrangementScenario}
      nowOffsetHours={0}
      inAppOpen
    />
  ),
};

/**
 * Repro 4: a project where the user has no items. The digest must land on the
 * proper empty state (header + "Nothing needs you") with the readable
 * "auto · updated" data-source status — never a stuck "arranging" read.
 */
export const EmptyProjectScopeDigest: Story = {
  render: () => {
    const graph = {
      ...iesGraphWithoutSprint,
      tickets: [],
      claims: [],
      decisions: [],
      changeRequests: [],
      transitions: [],
      blockers: [],
    };
    const plan = resolveDigestPlan(
      buildHeuristicDigestPlan(graph, DIGEST_FIXTURE_NOW_MS),
      graph,
      DIGEST_FIXTURE_NOW_MS,
    );
    return (
      <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-7 xl:px-10 2xl:px-14">
        <ProjectMyWorkDigestView
          plan={plan}
          graph={graph}
          nowMs={DIGEST_FIXTURE_NOW_MS}
          updatedAtMs={DIGEST_FIXTURE_NOW_MS - 2 * HOUR}
        />
      </div>
    );
  },
};

/**
 * Repro 5: the Hierarchy and Board lenses side by side — they must be visibly
 * different (depth-indented tree vs kanban columns), not two copies of one list.
 */
export const DistinctLensesSideBySide: Story = {
  render: () => {
    const storyTicket = (input: {
      id: string;
      displayId: string;
      title: string;
      status: string;
      updatedAt: string;
      parentId?: string;
    }): ProjectTicket => ({
      id: input.id,
      projectId: "story-project",
      status: input.status,
      assignee: "Philip",
      updatedAt: input.updatedAt,
      ref: {
        provider: "atlassian",
        kind: "issue",
        id: input.id,
        displayId: input.displayId,
        title: input.title,
        url: `https://jira/${input.displayId}`,
        projectId: "story-project",
      },
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    });
    const tickets = [
      storyTicket({
        id: "epic-1",
        displayId: "NEX-1",
        title: "Epical thing",
        status: "In Progress",
        updatedAt: "2026-09-14T08:00:00.000Z",
      }),
      storyTicket({
        id: "sub-2",
        displayId: "NEX-2",
        title: "Subtask of the epic",
        status: "To Do",
        updatedAt: "2026-09-14T09:00:00.000Z",
        parentId: "epic-1",
      }),
      storyTicket({
        id: "task-3",
        displayId: "NEX-3",
        title: "Standalone task",
        status: "In Progress",
        updatedAt: "2026-09-13T08:00:00.000Z",
      }),
    ];
    const hierarchy = buildProjectTicketHierarchy(tickets);
    const matchedTicketIds = new Set(tickets.map((ticket) => ticket.id));
    return (
      <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-7">
        <div className="grid gap-8 xl:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
              Hierarchy lens — depth-indented parent/child tree
            </h3>
            <ProjectMyWorkHierarchyView
              projectId="story-project"
              viewMode="list"
              hierarchy={hierarchy}
              contextByTicketId={new Map()}
              matchedTicketIds={matchedTicketIds}
              onTicketContextMenu={() => undefined}
              getTicketAgentContext={() => null}
              onOpenTicket={() => undefined}
              renderTicketExtra={() => null}
            />
          </div>
          <div className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
              Board lens — per-project kanban (read-only in the roll-up)
            </h3>
            <ProjectDashboardKanban
              kanbanColumns={buildProjectTicketKanbanColumns(tickets)}
              allTickets={tickets}
              isHierarchyMode={false}
              parentChildGroups={hierarchy}
              projectId="story-project"
              onOpenTicket={() => undefined}
              onTicketContextMenu={() => undefined}
            />
          </div>
        </div>
      </div>
    );
  },
};
