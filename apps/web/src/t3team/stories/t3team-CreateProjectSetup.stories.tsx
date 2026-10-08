import type { Meta, StoryObj } from "@storybook/react";

import type { CreateProjectPageHeaderEntry } from "~/t3team/t3team-CreateProjectPageHeader";
import { CreateProjectSetupFooter } from "~/t3team/t3team-CreateProjectSetupFooter";
import { CreateProjectSetupStep } from "~/t3team/t3team-CreateProjectSetupStep";
import {
  StoryFrame,
  discovery,
  repositoryCatalog,
  setupEntry,
  setupProps,
  typeInPageSearch,
  useLinkedState,
} from "./t3team-createProjectStoryFixtures";

const linkedByDefault = [repositoryCatalog[5]!.url];

type SetupStoryArgs = React.ComponentProps<typeof CreateProjectSetupStep> & {
  entry?: CreateProjectPageHeaderEntry;
  creating?: boolean;
  error?: unknown;
};

/** Wraps the step so row clicks really link and unlink, like the live page. */
function Interactive({
  entry = setupEntry,
  creating = false,
  error = null,
  ...args
}: SetupStoryArgs) {
  const linked = useLinkedState(args.linkedRepositoryUrls);
  return (
    <StoryFrame
      entry={entry}
      dismissible={!creating}
      footer={
        <CreateProjectSetupFooter
          projectTitle={entry.title}
          creating={creating}
          error={error}
          onBack={() => {}}
          onCreate={() => {}}
        />
      }
    >
      <CreateProjectSetupStep {...args} {...linked} />
    </StoryFrame>
  );
}

const meta = {
  title: "T3Team/Create Project/Setup",
  parameters: { layout: "fullscreen" },
  render: (args) => <Interactive {...args} />,
} satisfies Meta<typeof Interactive>;
export default meta;
type Story = StoryObj<typeof meta>;

/** What opens: nothing linked; the repositories suggested for the project are offered, unchecked. */
export const Defaults: Story = { args: setupProps() };

export const LinkedAndSuggested: Story = {
  args: setupProps({ linkedRepositoryUrls: linkedByDefault }),
};

export const MultiSiteHeader: Story = {
  args: { ...setupProps(), entry: { ...setupEntry, siteHost: "nexplore.atlassian.net" } },
};

export const PickerSearching: Story = {
  args: setupProps(),
  play: () => typeInPageSearch("ies"),
};

export const GitHubSignedOut: Story = {
  args: setupProps({
    discovery: discovery({ authStatus: "unauthenticated", catalog: [], authenticatedHosts: [] }),
  }),
};

export const PickerLoading: Story = {
  args: setupProps({ discovery: discovery({ loadingAuth: true, authStatus: "checking" }) }),
};

export const Creating: Story = {
  args: { ...setupProps({ linkedRepositoryUrls: linkedByDefault }), creating: true },
};

export const CreateFailed: Story = {
  args: {
    ...setupProps({ linkedRepositoryUrls: linkedByDefault }),
    error: new Error("This project is already added"),
  },
};
