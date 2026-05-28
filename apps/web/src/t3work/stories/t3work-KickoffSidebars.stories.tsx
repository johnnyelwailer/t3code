import type { Meta, StoryObj } from "@storybook/react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { T3workKickoffRecipeList } from "~/t3work/t3work-KickoffRecipeList";
import { buildT3workSidecarRecipeQuickStarts } from "~/t3work/t3work-sidecarRecipes";

function createProject(profileId: string, title: string): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title,
    source: {
      provider: "atlassian",
      externalProjectId: "ALPHA",
      externalProjectKey: "ALPHA",
      raw: {
        agentSetup: {
          profileId,
        },
      },
    },
    workspace: {
      rootPath: "/tmp/project-alpha",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

const productProject = createProject("product-partner", "Project Alpha");
const engineeringProject = createProject("engineering-copilot", "Project Alpha");

const projectDashboardRecipes = buildT3workSidecarRecipeQuickStarts({
  surface: "project.dashboard",
  project: productProject,
  profileId: "product-partner",
  selectedWorkLabel: productProject.title,
  dashboardMode: "backlog",
  currentViewSummary: {
    itemCount: 7,
    bugCount: 2,
    primaryBugLabel: "ALPHA-78",
    primaryItemLabel: "ALPHA-34",
  },
  availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
});

const ticketDetailRecipes = buildT3workSidecarRecipeQuickStarts({
  surface: "workitem.detail.sidepanel",
  project: engineeringProject,
  profileId: "engineering-copilot",
  selectedWorkLabel: "ALPHA-42",
  selectedWorkTitle: "Stabilize import retries",
  resourceKind: "ticket",
  jiraIssueType: "Bug",
  availableContextKeys: ["project.summary", "ticket.summary"],
});

function KickoffRecipePreview() {
  return (
    <div className="grid min-h-screen gap-8 bg-background p-8 text-foreground md:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-border/70 bg-card p-5">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Project dashboard backlog
          </p>
          <h2 className="text-lg font-semibold">Product partner rich quick starts</h2>
        </header>
        <T3workKickoffRecipeList recipes={projectDashboardRecipes} onSelectRecipe={() => {}} />
      </section>

      <section className="space-y-4 rounded-xl border border-border/70 bg-card p-5">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Ticket detail
          </p>
          <h2 className="text-lg font-semibold">Engineering copilot rich quick starts</h2>
        </header>
        <T3workKickoffRecipeList recipes={ticketDetailRecipes} onSelectRecipe={() => {}} />
      </section>
    </div>
  );
}

const meta = {
  title: "T3work/Kickoff Sidebars",
  component: KickoffRecipePreview,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof KickoffRecipePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
