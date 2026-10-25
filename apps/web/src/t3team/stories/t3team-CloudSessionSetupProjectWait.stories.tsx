/**
 * The "Project ready" step of the setup card while it waits: one story per reason the project is
 * not on the machine yet, at the elapsed time that shows its wording. The production card and the
 * production modules (`t3team-cloudProjectWait`, `t3team-cloudProjectWaitPresentation`); each
 * story freezes the clock so it reads the same every time.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { EnvironmentId, ProjectId, type CloudSession } from "@t3tools/contracts";

import { CloudSessionSetupCard } from "~/cloud/t3team-CloudSessionSetupCard";
import {
  type CloudProjectWait,
  type CloudProjectWaitInput,
  classifyCloudProjectWait,
} from "~/cloud/t3team-cloudProjectWait";
import { decodeCloudQueuedSend } from "~/cloud/t3team-cloudQueuedSendModel";

function session(overrides: Partial<CloudSession>): CloudSession {
  return {
    sessionId: "session-story",
    providerKind: "github_actions",
    phase: "ready",
    elapsedSeconds: 120,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim · 12 GB · 4 cores",
    failureReason: null,
    detailsUrl: null,
    ...overrides,
  };
}

const meta = {
  title: "Cloud/CloudSessionSetupCard/ProjectReady",
  component: CloudSessionSetupCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-[44rem] px-2 pt-6">
        <Story />
      </div>
    ),
  ],
  args: { facts: { session: session({}), machineConnected: true } },
} satisfies Meta<typeof CloudSessionSetupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const STORY_ENVIRONMENT = EnvironmentId.make("env-cloud-story");
const STORY_REPOSITORY = {
  canonicalKey: "ghe/hive/nx-nexi",
  locator: { source: "git-remote" as const, remoteName: "origin", remoteUrl: "ghe/hive/nx-nexi" },
};
const STORY_COMPOSER = {
  id: ProjectId.make("p-nx-nexi"),
  title: "nx-nexi",
  workspaceRoot: "/Users/me/nx-nexi",
  repositoryIdentity: STORY_REPOSITORY,
};
const STORY_QUEUED = decodeCloudQueuedSend({
  messageId: "msg-story",
  messageText: "Run the migration",
  outgoingText: "Run the migration",
  titleSeed: "Run the migration",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-story",
  sessionLabel: "nexi-machine",
  createdAt: "2026-10-13T08:00:00.000Z",
  stepStartedAt: { project: "2026-10-13T08:02:00.000Z" },
});

function projectWait(over: Partial<CloudProjectWaitInput>): CloudProjectWait {
  return classifyCloudProjectWait({
    environmentId: STORY_ENVIRONMENT,
    scratch: false,
    machineSettingsLoaded: true,
    expectedCwd: "/home/runner/work/nx-nexi",
    scratchRoot: "/home/runner/.t3/scratch",
    composer: STORY_COMPOSER,
    projects: [],
    ...over,
  });
}

const STORY_PROJECT_STARTED_MS = Date.parse("2026-10-13T08:02:00.000Z");

/** The project step `waitingSeconds` after its own stamp, on a session that has been up a while. */
function projectStepStory(wait: CloudProjectWait, waitingSeconds: number): Story {
  return {
    args: {
      facts: {
        session: session({ phase: "ready", elapsedSeconds: 600 + waitingSeconds }),
        machineConnected: true,
        delivery: "queued",
        queued: STORY_QUEUED ?? undefined,
        projectWait: wait,
      },
      frozenElapsedSeconds: 600 + waitingSeconds,
      frozenNowMs: STORY_PROJECT_STARTED_MS + waitingSeconds * 1000,
      onCancel: () => {},
    },
  };
}

const LISTED_ELSEWHERE = [
  { title: "work", workspaceRoot: "/srv/elsewhere", repositoryIdentity: null },
];

/** Connected, and the app has not received any project list from the machine yet. */
export const ProjectWaitingForList: Story = projectStepStory(projectWait({}), 6);

/** The machine lists other projects but not the draft's folder: what is expected, after 40 s. */
export const ProjectNotListedExpected: Story = projectStepStory(
  projectWait({ projects: LISTED_ELSEWHERE }),
  40,
);

/** The same wait after 10 minutes: the unmet condition and a diagnostic to copy. */
export const ProjectNotListedSlow: Story = projectStepStory(
  projectWait({ projects: LISTED_ELSEWHERE }),
  637,
);

/** The machine has not reported its settings, so the app cannot know which folder to expect. */
export const ProjectMachineSettingsPending: Story = projectStepStory(
  projectWait({ machineSettingsLoaded: false }),
  140,
);

/** A project is listed at the machine's folder, but it is another repository. */
export const ProjectDifferentRepository: Story = projectStepStory(
  projectWait({
    projects: [
      {
        title: "other-repo",
        workspaceRoot: "/home/runner/work/nx-nexi",
        repositoryIdentity: { ...STORY_REPOSITORY, canonicalKey: "ghe/hive/other-repo" },
      },
    ],
  }),
  200,
);

/** A project without a remote only matches its own folder on the machine. */
export const ProjectDifferentFolder: Story = projectStepStory(
  projectWait({
    composer: { ...STORY_COMPOSER, repositoryIdentity: null },
    projects: [
      { title: "work", workspaceRoot: "/home/runner/work/nx-nexi", repositoryIdentity: null },
    ],
  }),
  200,
);

/** The machine registers no project folder, and none of its projects is this one. */
export const ProjectNoMatch: Story = projectStepStory(
  projectWait({ expectedCwd: null, projects: LISTED_ELSEWHERE }),
  200,
);

/** A "No project" draft: the app is opening the machine's scratch folder. */
export const ProjectScratchOpening: Story = projectStepStory(
  projectWait({ scratch: true, composer: null }),
  25,
);
