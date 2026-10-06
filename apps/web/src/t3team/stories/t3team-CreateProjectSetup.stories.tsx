import type { Meta, StoryObj } from "@storybook/react";

import { CreateProjectSetupStep } from "~/t3team/t3team-CreateProjectSetupStep";
import {
  StoryFrame,
  discovery,
  repositoryCatalog,
  setupProps,
  typeInDialogSearch,
  useLinkedState,
} from "./t3team-createProjectStoryFixtures";

const linkedByDefault = [repositoryCatalog[5]!.url];

/** Wraps the step so row clicks really link and unlink, like the live dialog. */
function Interactive(args: React.ComponentProps<typeof CreateProjectSetupStep>) {
  const linked = useLinkedState(args.linkedRepositoryUrls);
  return (
    <StoryFrame>
      <CreateProjectSetupStep {...args} {...linked} />
    </StoryFrame>
  );
}

const meta = {
  title: "T3Team/Create Project/Setup",
  parameters: { layout: "fullscreen" },
  render: (args) => <Interactive {...args} />,
} satisfies Meta<typeof CreateProjectSetupStep>;
export default meta;
type Story = StoryObj<typeof meta>;

/** What opens: nothing linked; the repositories suggested for the project are offered, unchecked. */
export const Defaults: Story = { args: setupProps() };

export const LinkedAndSuggested: Story = {
  args: setupProps({ linkedRepositoryUrls: linkedByDefault }),
};

export const MultiSiteHeader: Story = {
  args: setupProps({
    entry: { ...setupProps().entry, siteHost: "nexplore.atlassian.net" },
  }),
};

export const PickerSearching: Story = {
  args: setupProps(),
  play: () => typeInDialogSearch("ies"),
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
  args: setupProps({
    linkedRepositoryUrls: linkedByDefault,
    submitState: { kind: "creating" },
  }),
};

export const CreateFailed: Story = {
  args: setupProps({
    linkedRepositoryUrls: linkedByDefault,
    submitState: { kind: "error", error: new Error("This project is already added") },
  }),
};
