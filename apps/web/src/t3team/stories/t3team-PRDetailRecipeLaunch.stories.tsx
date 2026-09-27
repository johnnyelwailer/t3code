/**
 * Explore: see and launch recipes directly from the PR detail view — without adding another
 * chat-launch sidebar, since the PR panel already lives inside one.
 *
 * Every story renders the REAL `PullRequestDetailPanel` (header, tabs, summary document,
 * timeline) with the sample pull request PR #1428, whose data arrives through the
 * storybook-only seam in `src/state/pullRequests.storyMock.ts`. The recipe catalog is modelled
 * on the pr / ies-review / ies-ops skill phase tables — the realistic candidates a surface on
 * this pull request would offer.
 *
 * The variants, and the trade-off each lives with:
 * - Header launch: the first-class recipes are visible buttons beside Check out — one click,
 *   no menu; the long tail recipes stay one click deeper in the overflow.
 * - Strip triggers: recipes where the need shows up (failing check → Fix CI, open comments →
 *   Handle comments); needs per-recipe context awareness to earn its keep.
 * - Summary section: reads as part of the document ("what can happen to this PR"); costs
 *   scroll distance on a long description.
 * - Actions tab: room to browse the whole catalog; a tab implies state, and this is actions.
 *
 * Clicking a recipe in any variant records the launch underneath the frame — in the app it
 * would open a new thread running the recipe's kickoff workflow
 * (`launchRecipeWorkflowOnThread`), the same path the workitem kickoff panel uses.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { RocketIcon } from "lucide-react";

import { withT3TeamRouter } from "~/t3team/storybook/t3team-storybook-router-decorator";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

import {
  PrDetailRecipeFrame,
  type PrRecipeSurfaceVariant,
} from "./t3team-PRDetailRecipeSurfaces";

const meta = {
  title: "T3Team/PR Detail — Recipe Launch",
  decorators: [withT3TeamRouter],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function VariantStory({ variant }: { variant: PrRecipeSurfaceVariant }) {
  const [launched, setLaunched] = useState<T3TeamSidecarRecipeQuickStart | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="h-[min(46rem,78vh)] w-[min(56rem,100%)] overflow-hidden rounded-xl border border-border bg-background">
        <PrDetailRecipeFrame variant={variant} onLaunched={setLaunched} />
      </div>
      {launched ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RocketIcon aria-hidden className="size-3.5 shrink-0" />
          “{launched.title}” is launching — in the app this opens a new thread running its
          kickoff workflow against the pull request.
        </p>
      ) : null}
    </div>
  );
}

export const Control: Story = {
  name: "No recipe surface (control)",
  render: () => <VariantStory variant="none" />,
};

export const HeaderLaunch: Story = {
  name: "Header launch — visible one-click buttons",
  render: () => <VariantStory variant="header-launch" />,
};

export const StripTriggers: Story = {
  name: "Strip triggers — chips where the need shows up",
  render: () => <VariantStory variant="strip-triggers" />,
};

export const SummarySection: Story = {
  name: "Summary section — end of the document",
  render: () => <VariantStory variant="summary-section" />,
};

export const ActionsTab: Story = {
  name: "Actions tab — after Code",
  render: () => <VariantStory variant="actions-tab" />,
};
