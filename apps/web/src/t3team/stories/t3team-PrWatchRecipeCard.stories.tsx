/**
 * PR watch, the recipe card (hive design packet doc 07 §2). Every block is the REAL quick-start
 * card: `T3TeamKickoffRecipeList` compiling the recipe's own MDX action view, which renders the
 * MDX-kit `RunToggle`. The card reads its run through `useRecipeRun`; here that seam is fed by
 * `T3TeamRecipeRunFixture` with one snapshot per state, exactly the shape the selector builds
 * from thread shells and facts. The watch-thread rows inside the count hovers are the real
 * `WatchedPullRequestCardRow`. Nothing is a mock copy.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ReactNode } from "react";

import { T3TeamRecipeRunFixture } from "~/state/t3team-recipeRun";
import type { RecipeRunSnapshot } from "~/state/t3team-recipeRun.logic";
import { T3TeamWatchedPullRequestsFixture } from "~/state/t3team-watchedPullRequests";
import { withT3TeamRouter } from "~/t3team/storybook/t3team-storybook-router-decorator";
import { T3TeamKickoffRecipeList } from "~/t3team/t3team-KickoffRecipeList";
import { PrWatchDigestStatus } from "~/t3team/t3team-PrWatchDigestStatus";
import {
  RUN_CONFIG_WARNING,
  RUN_FAILED,
  RUN_FALLBACK,
  RUN_NEEDS_YOU,
  RUN_OFF,
  RUN_QUIET,
  RUN_SIGN_IN,
  RUN_STARTING,
  WATCHED_FIXTURE,
} from "~/t3team/t3team-prWatchFixtures";
import { RecipeRunToggleStopDialog } from "~/t3team/t3team-recipeRunToggleStopDialog";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import { T3TeamSidecarSectionItemMenu } from "~/t3team/t3team-sidecarSectionMenu";

/** The pack recipe's action view, as `nexi-work/pack/.../pr-watch/action-view.mdx` will ship it. */
const PR_WATCH_ACTION_VIEW = `
export default function Action() {
  return (
    <RunToggle
      title="Watch my PRs"
      offDescription="babysits every open PR you wrote or review, on Nexplore Conductor"
    />
  );
}
`;

const project: ProjectShellProject = {
  id: "project-nexi" as ProjectShellProject["id"],
  title: "Nexi AI",
  source: { provider: "atlassian", externalProjectId: "NXAI", externalProjectKey: "NXAI", raw: {} },
  workspace: { rootPath: "/Users/pj/nexi-ai", createdAt: "2026-05-01T00:00:00.000Z" },
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

const prWatchQuickStart: T3TeamSidecarRecipeQuickStart = {
  id: "pr-watch",
  title: "Watch my PRs",
  description: "Babysits every open PR you wrote or review.",
  prompt: "",
  workflow: {
    kind: "recipe",
    recipeId: "pr-watch",
    recipeVersion: "1.0.0",
    title: "Watch my PRs",
    description: "Babysits every open PR you wrote or review.",
    source: "pack",
    surface: "project.dashboard.myWork",
    recipePath: "/Users/pj/nexi-ai/.nexi/packs/nexplore-global/recipes/pr-watch/recipe.ts",
    workflowPath:
      "/Users/pj/nexi-ai/.nexi/packs/nexplore-global/recipes/pr-watch/pr-watch.workflow.ts",
  },
  actionView: {
    source: PR_WATCH_ACTION_VIEW,
    context: {
      surface: "project.dashboard.myWork",
      project: { id: project.id, title: project.title, workspaceRoot: project.workspace?.rootPath },
      linkedResources: [],
      artifacts: [],
      profile: { id: "engineering-copilot" },
      enabledSkillPacks: [],
      schema: {},
      availableContextKeys: [],
    } as unknown as NonNullable<T3TeamSidecarRecipeQuickStart["actionView"]>["context"],
  },
};

const otherQuickStarts: ReadonlyArray<T3TeamSidecarRecipeQuickStart> = [
  {
    id: "was-braucht-mich",
    title: "Was braucht mich?",
    description: "Rangliste der wartenden, blockierten und stehengebliebenen Items",
    prompt: "",
  },
  {
    id: "arrange-my-work",
    title: "Für mich ordnen",
    description: "Ein Agent ordnet deinen My-Work-Digest",
    prompt: "",
  },
];

/** The dashboard's kickoff aside: section title, the quick-start list, the per-card kebab. */
function KickoffAside({ run, children }: { run: RecipeRunSnapshot; children?: ReactNode }) {
  return (
    <T3TeamRecipeRunFixture.Provider value={run}>
      <T3TeamWatchedPullRequestsFixture.Provider value={WATCHED_FIXTURE}>
        <aside className="w-96 space-y-3 border-l border-border/70 bg-background p-5">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
            Quick starts
          </h4>
          <T3TeamKickoffRecipeList
            recipes={[prWatchQuickStart, ...otherQuickStarts]}
            onSelectRecipe={() => {}}
            renderRecipe={(recipe, content) => (
              <T3TeamSidecarSectionItemMenu
                label={`${recipe.title} actions`}
                entries={[
                  { kind: "action", id: "pin", label: "Pin", onSelect: () => {} },
                  { kind: "action", id: "hide", label: "Hide", onSelect: () => {} },
                ]}
              >
                {content}
              </T3TeamSidecarSectionItemMenu>
            )}
          />
          {children}
        </aside>
      </T3TeamWatchedPullRequestsFixture.Provider>
    </T3TeamRecipeRunFixture.Provider>
  );
}

function State({ label, run }: { label: string; run: RecipeRunSnapshot }) {
  return (
    <div className="space-y-1.5">
      <p className="text-2xs font-semibold text-muted-foreground">{label}</p>
      <KickoffAside run={run} />
    </div>
  );
}

const STATES: ReadonlyArray<{ label: string; run: RecipeRunSnapshot }> = [
  { label: "A · Off", run: RUN_OFF },
  { label: "B · Starting", run: RUN_STARTING },
  { label: "C · On, quiet", run: RUN_QUIET },
  { label: "D · On, needs you (hover a count)", run: RUN_NEEDS_YOU },
  { label: "E · Warning: fallback model", run: RUN_FALLBACK },
  { label: "F · Warning: config contract", run: RUN_CONFIG_WARNING },
  { label: "G · Warning: GHE sign-in", run: RUN_SIGN_IN },
  { label: "J · Run failed", run: RUN_FAILED },
];

function AllStates() {
  return (
    <div className="flex flex-wrap gap-6 bg-background p-6 text-foreground">
      {STATES.map((state) => (
        <State key={state.label} {...state} />
      ))}
    </div>
  );
}

const meta = {
  title: "T3Team/PR Watch/Recipe Card",
  component: AllStates,
  decorators: [withT3TeamRouter],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AllStates>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllCardStates: Story = {};

function single(run: RecipeRunSnapshot): Story {
  return {
    render: () => (
      <div className="bg-background p-6 text-foreground">
        <KickoffAside run={run} />
      </div>
    ),
  };
}

export const Off: Story = single(RUN_OFF);
export const Starting: Story = single(RUN_STARTING);
export const OnQuiet: Story = single(RUN_QUIET);
export const OnNeedsYou: Story = single(RUN_NEEDS_YOU);
export const WarningFallback: Story = single(RUN_FALLBACK);
export const WarningConfig: Story = single(RUN_CONFIG_WARNING);
export const WarningSignIn: Story = single(RUN_SIGN_IN);
export const RunFailed: Story = single(RUN_FAILED);

/** H · the one confirm before the switch goes off (the real dialog, held open). */
export const StopConfirm: Story = {
  render: () => (
    <div className="bg-background p-6 text-foreground">
      <KickoffAside run={RUN_NEEDS_YOU} />
      <RecipeRunToggleStopDialog open watched={12} onOpenChange={() => {}} onConfirm={() => {}} />
    </div>
  ),
};

/** I · the digest header's one-liner (decision 2), beside "Jira synced", real component. */
export const DigestHeaderCount: Story = {
  render: () => (
    <div className="space-y-4 bg-background p-6 text-foreground">
      {[RUN_OFF, RUN_QUIET, RUN_NEEDS_YOU].map((run, index) => (
        <T3TeamRecipeRunFixture.Provider key={index} value={run}>
          <div className="flex flex-wrap items-center gap-x-7 text-xs text-muted-foreground">
            <b className="text-sm font-semibold text-foreground">My Work</b>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Jira synced 3 min ago
            </span>
            <PrWatchDigestStatus projectId="project-nexi" />
          </div>
        </T3TeamRecipeRunFixture.Provider>
      ))}
    </div>
  ),
};
