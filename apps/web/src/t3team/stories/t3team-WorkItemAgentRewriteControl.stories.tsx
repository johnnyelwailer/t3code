import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { WorkItemAgentRewriteControl } from "~/t3team/workitem/t3team-WorkItemAgentRewriteControl";
import {
  useWorkItemAgentRewrite,
  type UseWorkItemAgentRewriteInput,
} from "~/t3team/workitem/t3team-useWorkItemAgentRewrite";

const BASE_PROPS: UseWorkItemAgentRewriteInput = {
  backend: {} as BackendApi,
  projectId: "project-1",
  ticketId: "KOOR-1",
  issueIdOrKey: "KOOR-1",
  ticketDisplayId: "KOOR-1",
  descriptionText: "The camera resets to the default angle after a session reload.",
  summary: "Camera resets on reload",
  githubActivityItems: [],
  hasPendingDescriptionDraft: false,
  hasLoadedWorkItem: true,
  // Idle story only demonstrates the at-rest button; kickoff navigation has nothing to show here.
  onKickoffThread: () => {},
};

function fakeBackend(dispatchCommand: BackendApi["dispatchCommand"]): BackendApi {
  return { dispatchCommand } as unknown as BackendApi;
}

/** Starts the rewrite itself on mount, so the story lands directly on the state it demonstrates
 * rather than requiring the Storybook viewer to click the button first. */
function AutoStart(props: UseWorkItemAgentRewriteInput) {
  const rewrite = useWorkItemAgentRewrite(props);
  useEffect(() => {
    rewrite.start();
    // Runs once, on mount, to reach the in-flight/error state immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <WorkItemAgentRewriteControl {...props} />;
}

const meta = {
  title: "T3Team/Work Item Agent Rewrite Control",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  render: () => <WorkItemAgentRewriteControl {...BASE_PROPS} />,
};

export const InFlight: Story = {
  render: () => (
    <AutoStart
      {...BASE_PROPS}
      activeThreadId="thread-1"
      backend={fakeBackend(() => new Promise(() => {}))}
    />
  ),
};

export const DisabledDraftPending: Story = {
  render: () => <WorkItemAgentRewriteControl {...BASE_PROPS} hasPendingDescriptionDraft />,
};

/** The work item itself hasn't loaded (or failed to) — disabled rather than sending a prompt built
 * from empty data. */
export const DisabledNotLoaded: Story = {
  render: () => <WorkItemAgentRewriteControl {...BASE_PROPS} hasLoadedWorkItem={false} />,
};

export const ErrorState: Story = {
  render: () => (
    <AutoStart
      {...BASE_PROPS}
      activeThreadId="thread-1"
      backend={fakeBackend(() =>
        Promise.reject(new Error("Thread already has a turn in progress.")),
      )}
    />
  ),
};
