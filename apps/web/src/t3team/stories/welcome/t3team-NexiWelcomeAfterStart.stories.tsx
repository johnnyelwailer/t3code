import type { Meta, StoryObj } from "@storybook/react";
import { FolderGit2Icon, LinkIcon, MessageSquareDashedIcon, PlusIcon } from "lucide-react";

import { ClaudeAI, CursorIcon, OpenAI } from "~/components/Icons";
import { NexploreAI } from "~/components/t3team-NexploreAIIcon";
import { getSourceControlPresentationForKind } from "~/sourceControlPresentation";
import { JiraIcon } from "~/t3team/components/brand/t3team-AtlassianLogos";
import { Button } from "~/t3team/components/ui/t3team-button";

/**
 * Landing after Welcome → Start: the normal empty home (NoProjectsHero).
 * "Add project" opens the existing command-palette add-project flow
 * (`CommandPaletteAddProject` / CommandPalette open: "add-project"):
 * local folder, new project, Git URL, clone from provider — plus this fork's
 * Jira project entry (`buildT3TeamAddProjectJiraSource`). Do not rebuild it here.
 */
const GitHubIcon = getSourceControlPresentationForKind("github").Icon;

function AfterStartHome() {
  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      data-welcome-mockup=""
      data-after-start=""
    >
      <div className="flex flex-1 flex-col items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-lg px-4 text-center sm:px-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What should we work on?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Add a project, or start without one.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button size="sm">
              <PlusIcon className="size-4" />
              Add project
            </Button>
            <Button size="sm" variant="outline">
              <MessageSquareDashedIcon className="size-4" />
              Start without a project
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Proposal only: how a Jira+repo step might appear inside the palette later. */
function AddProjectPaletteProposal() {
  const row = (icon: React.ReactNode, title: string, description: string, hint?: string) => (
    <div className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent/60">
      <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {hint ? <span className="text-3xs text-muted-foreground">{hint}</span> : null}
    </div>
  );

  return (
    <div className="flex min-h-screen items-start justify-center bg-background p-8 text-foreground">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Proposal · Add project palette
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Not on the welcome page. Extends the existing command-palette flow if Nexi needs
            Jira-project + repo choice later.
          </p>
        </div>
        <div className="divide-y divide-border/50 p-2">
          {row(
            <JiraIcon className="size-4" />,
            "Jira project",
            "Pick a project from Jira",
            "Existing",
          )}
          {row(
            <FolderGit2Icon />,
            "Browse a local folder",
            "Open a folder on this computer",
            "Upstream",
          )}
          {row(<LinkIcon />, "Clone from a Git URL", "Paste a repository URL", "Upstream")}
          {row(
            <GitHubIcon className="size-4" />,
            "Clone from GitHub",
            "Pick a repository",
            "Upstream",
          )}
          <div className="rounded-md border border-dashed border-border/80 bg-muted/30 px-3 py-2.5">
            <p className="text-xs font-medium text-foreground">Proposed follow-on (not built)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              After choosing a Jira project, optionally link a repository — still inside this
              palette, never on welcome.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 text-3xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <NexploreAI className="size-3.5" /> Agents stay on welcome
          </span>
          <span className="inline-flex items-center gap-1">
            <ClaudeAI className="size-3.5" />
            <OpenAI className="size-3.5" />
            <CursorIcon className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Welcome/After Start",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** Mirrors NoProjectsHero after Welcome → Start. */
export const NewThreadHome: Story = {
  render: () => <AfterStartHome />,
};

/** Clearly labelled proposal — Jira+repo belongs in the palette, not welcome. */
export const AddProjectPaletteJiraRepoProposal: Story = {
  name: "Proposal: palette Jira + repo",
  render: () => <AddProjectPaletteProposal />,
};
