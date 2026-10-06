import type { Meta, StoryObj } from "@storybook/react";

import { CreateProjectChooseStep } from "~/t3team/t3team-CreateProjectChooseStep";
import { JiraProjectDialogShell } from "~/t3team/t3team-JiraProjectDialogShell";
import { T3TeamSetupWelcomeSurface } from "~/t3team/t3team-SetupWelcomeSurface";
import {
  ConnectFrame,
  StoryFrame,
  catalogState,
  chooseProps,
  connectFixture,
  nexploreProjects,
  typeInDialogSearch,
} from "./t3team-createProjectStoryFixtures";

const meta = {
  title: "T3Team/Create Project/Choose",
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <StoryFrame>
      <CreateProjectChooseStep {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof CreateProjectChooseStep>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Two sites: rows say which site they are on, added projects sit under their own heading. */
export const ManySites: Story = { args: chooseProps() };

export const OneSite: Story = {
  args: chooseProps({ catalogState: catalogState({ catalog: nexploreProjects }) }),
};

export const Searching: Story = {
  args: chooseProps(),
  play: () => typeInDialogSearch("mob"),
};

export const NoResults: Story = {
  args: chooseProps(),
  play: () => typeInDialogSearch("zzzz"),
};

export const Loading: Story = {
  args: chooseProps({
    catalogState: catalogState({ catalog: [], loading: true, connected: null }),
  }),
};

export const RefreshingWithCachedRows: Story = {
  args: chooseProps({ catalogState: catalogState({ loading: true }) }),
};

export const LoadFailed: Story = {
  args: chooseProps({
    catalogState: catalogState({
      catalog: [],
      error: new Error("Atlassian did not answer in time."),
    }),
  }),
};

export const DeepLinkProjectGone: Story = {
  args: chooseProps({ notice: "That project is no longer available — pick another." }),
};

export const NotConnected: Story = {
  args: chooseProps({
    catalogState: catalogState({ catalog: [], connected: false }),
    connectPanel: <ConnectFrame connect={connectFixture()} />,
  }),
};

export const NotConnectedPopupBlocked: Story = {
  args: chooseProps({
    catalogState: catalogState({ catalog: [], connected: false }),
    connectPanel: (
      <ConnectFrame
        connect={connectFixture({
          kind: "needs_manual_open",
          signinUrl: "http://localhost:5736/api/t3team/atlassian/oauth/begin/8f14e45fceea167a",
        })}
      />
    ),
  }),
};

export const NotConnectedTokenFallback: Story = {
  args: chooseProps({
    catalogState: catalogState({ catalog: [], connected: false }),
    connectPanel: <ConnectFrame connect={connectFixture()} initialShowTokenForm />,
  }),
};

/** First run: the same dialog opens over the welcome surface, no separate inline copy. */
export const FirstRunOverWelcome: Story = {
  args: chooseProps(),
  render: (args) => (
    <>
      <div className="flex h-screen flex-col bg-background">
        <T3TeamSetupWelcomeSurface onCreate={() => {}} />
      </div>
      <JiraProjectDialogShell onClose={() => {}}>
        <CreateProjectChooseStep {...args} />
      </JiraProjectDialogShell>
    </>
  ),
};
