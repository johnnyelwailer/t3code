import type { Meta, StoryObj } from "@storybook/react";
import { ShieldAlert } from "lucide-react";

import { CalmError } from "~/t3team/t3team-CalmError";
import { CalmNotice } from "~/t3team/t3team-CalmNotice";

/**
 * The one calm (non-danger) notice shared by every error and empty state in the add-project flow
 * (catalog load failures, a failed create, a signed-out picker, a deep link that no longer
 * resolves). Composed-in-context screenshots of the same states live alongside the screens that
 * show them (Choose, Setup, Repository Picker); this gallery is the component in isolation.
 */
const meta = {
  title: "T3Team/Create Project/Errors",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const CatalogLoadFailed: Story = {
  render: () => (
    <div className="w-[26rem] rounded-xl border border-border">
      <CalmError
        error={new Error("Atlassian did not answer in time.")}
        action="loading Jira projects"
        headline="Couldn't reach Jira"
        retryLabel="Retry"
        onRetry={() => {}}
      />
    </div>
  ),
};

export const CreateFailed: Story = {
  render: () => (
    <div className="w-[30rem] rounded-xl border border-border p-3">
      <CalmError
        compact
        error={new Error("This project is already added")}
        action="adding IES NG"
        headline="Couldn't add IES NG"
      />
    </div>
  ),
};

export const GitHubSignedOut: Story = {
  render: () => (
    <div className="w-[26rem] rounded-xl border border-border p-3">
      <CalmNotice
        compact
        icon={ShieldAlert}
        headline="Not signed in to GitHub"
        detail="Add --hostname your.ghe.host for Enterprise. You can still paste a URL above."
        primaryAction={{ label: "Recheck", onClick: () => {} }}
      >
        <code className="font-mono text-2xs text-muted-foreground">gh auth login</code>
      </CalmNotice>
    </div>
  ),
};

export const DeepLinkProjectGone: Story = {
  render: () => (
    <div className="w-[26rem] rounded-xl border border-border p-3">
      <CalmNotice compact headline="That project is no longer available — pick another." />
    </div>
  ),
};
