/**
 * Stories for the digest's owner fixes (nexplore.ghe.com/pj/nexi-distribution#480):
 * the cold-start "backend starting / retrying" state and its automatic recovery,
 * and the full-width layout.
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
import { heuristicArrangementScenario } from "~/t3team/t3team-projectMyWorkDigestFixtureScenarios";

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
