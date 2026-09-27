/**
 * The recipe-surface variants explored on the real `PullRequestDetailPanel` — the panel itself is
 * unchanged apart from its four extension seams (`headerExtension`, `stripExtension`,
 * `contentExtension`, `extensionTabs`); these components only decide what goes in them.
 *
 * The catalog is modelled on the pr / ies-review / ies-ops skill phase tables, which are the
 * realistic candidates a surface on a pull request would offer.
 *
 * First-class means what the per-finding "Fix in a thread" button means: visible, verb-labelled,
 * one click — not buried in a settings-shaped menu. The header variant therefore renders the top
 * recipes as launch buttons of their own and keeps only the long tail in an overflow.
 */
import type { ComponentProps } from "react";

import {
  BadgeCheckIcon,
  BookOpenIcon,
  EyeIcon,
  GitMergeIcon,
  HammerIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  RadarIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { PullRequestDetailPanel } from "~/components/pullRequest/PullRequestDetailPanel";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { T3TeamKickoffRecipeList } from "~/t3team/t3team-KickoffRecipeList";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

import { PR_RECIPES, PR_REFERENCE, STORY_ENVIRONMENT_ID } from "./t3team-prDetailRecipeStoryData";

export type PrRecipeSurfaceVariant =
  | "none"
  | "header-launch"
  | "strip-triggers"
  | "summary-section"
  | "actions-tab";

type Launch = (recipe: T3TeamSidecarRecipeQuickStart) => void;

const RECIPE_ICON: Record<string, React.ReactNode> = {
  "pr-prepush": <ShieldCheckIcon aria-hidden className="size-3.5" />,
  "pr-review": <EyeIcon aria-hidden className="size-3.5" />,
  "pr-fix-ci": <HammerIcon aria-hidden className="size-3.5" />,
  "pr-handle-comments": <MessageSquareIcon aria-hidden className="size-3.5" />,
  "pr-watch": <RadarIcon aria-hidden className="size-3.5" />,
  "pr-post-review": <BadgeCheckIcon aria-hidden className="size-3.5" />,
  "pr-merge": <GitMergeIcon aria-hidden className="size-3.5" />,
};

const RECIPE_FALLBACK_ICON = <BookOpenIcon aria-hidden className="size-3.5" />;

function recipeIcon(recipe: T3TeamSidecarRecipeQuickStart) {
  return RECIPE_ICON[recipe.id] ?? RECIPE_FALLBACK_ICON;
}

/**
 * The four recipes a pull request in this state actually needs: checks are failing, there are
 * open review comments, and the reader wants to track progress. In the real surface this
 * selection would be contextual (driven by the PR's state); in the story it is pinned.
 */
const HEADER_RECIPE_IDS = ["pr-fix-ci", "pr-handle-comments", "pr-review", "pr-watch"];

const HEADER_SHORT_LABEL: Record<string, string> = {
  "pr-fix-ci": "Fix CI",
  "pr-handle-comments": "Handle comments",
  "pr-review": "Review",
  "pr-watch": "Watch",
};

function MenuItemForRecipe({
  recipe,
  onLaunch,
}: {
  recipe: T3TeamSidecarRecipeQuickStart;
  onLaunch: Launch;
}) {
  return (
    <MenuItem onClick={() => onLaunch(recipe)}>
      {recipeIcon(recipe)}
      <span className="flex min-w-0 flex-col">
        <span>{recipe.title}</span>
        <span className="text-xs text-muted-foreground">{recipe.description}</span>
      </span>
    </MenuItem>
  );
}

/**
 * Variant: the first-class recipes are buttons in the header actions, beside Check out — visible
 * at rest, one click to launch, the same treatment the summary's "Fix in a thread" button gets.
 * No overflow menu: every primary recipe is its own button, so nothing is hidden behind a second
 * kebab in a row that already has the panel's "More actions" kebab.
 */
function HeaderLaunchButtons({ onLaunch }: { onLaunch: Launch }) {
  const primary = PR_RECIPES.filter((recipe) => HEADER_RECIPE_IDS.includes(recipe.id));
  return (
    <>
      {primary.map((recipe) => (
        <Button
          key={recipe.id}
          size="xs"
          variant="ghost"
          onClick={() => onLaunch(recipe)}
          aria-label={`Run “${recipe.title}” on this pull request`}
        >
          {recipeIcon(recipe)}
          <span className="@max-[38rem]/pr-header:hidden">
            {HEADER_SHORT_LABEL[recipe.id] ?? recipe.title}
          </span>
        </Button>
      ))}
    </>
  );
}

/**
 * Variant: trigger chips on the tab strip, anchored where the need shows up — the failing check
 * offers "Fix CI", the open review comments offer "Handle comments", the rest live in "More".
 */
function StripTriggerChips({ onLaunch }: { onLaunch: Launch }) {
  const fixCi = PR_RECIPES.find((recipe) => recipe.id === "pr-fix-ci");
  const handleComments = PR_RECIPES.find((recipe) => recipe.id === "pr-handle-comments");
  const rest = PR_RECIPES.filter((recipe) => recipe !== fixCi && recipe !== handleComments);
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      {fixCi ? (
        <Button size="xs" variant="outline" onClick={() => onLaunch(fixCi)}>
          <HammerIcon aria-hidden className="size-3" />
          Fix CI
        </Button>
      ) : null}
      {handleComments ? (
        <Button size="xs" variant="outline" onClick={() => onLaunch(handleComments)}>
          <MessageSquareIcon aria-hidden className="size-3" />
          Handle comments
        </Button>
      ) : null}
      <Menu>
        <MenuTrigger
          render={
            <Button size="xs" variant="ghost" aria-label="More workflows">
              <MoreHorizontalIcon aria-hidden className="size-3" />
              <span className="ml-0.5 text-[10px] text-muted-foreground">More</span>
            </Button>
          }
        />
        <MenuPopup align="end" side="bottom" className="w-72">
          {rest.map((recipe) => (
            <MenuItemForRecipe key={recipe.id} recipe={recipe} onLaunch={onLaunch} />
          ))}
        </MenuPopup>
      </Menu>
    </div>
  );
}

/** Variant: a "Run a workflow" section at the end of the summary document. */
function SummarySection({ onLaunch }: { onLaunch: Launch }) {
  return (
    <section aria-label="Run a workflow on this pull request" className="border-t border-border/60 px-4 py-3">
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">
        Run a workflow on this pull request
      </h2>
      <T3TeamKickoffRecipeList recipes={PR_RECIPES} onSelectRecipe={onLaunch} />
    </section>
  );
}

/** Variant: a dedicated "Actions" tab after Code, listing the whole catalog. */
function ActionsTabContent({ onLaunch }: { onLaunch: Launch }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <h2 className="text-sm font-medium">Actions for this pull request</h2>
      <p className="mb-3 mt-1 text-xs text-muted-foreground">
        Each one starts a thread that runs its kickoff workflow against this pull request.
      </p>
      <T3TeamKickoffRecipeList recipes={PR_RECIPES} onSelectRecipe={onLaunch} />
    </div>
  );
}

type PanelSeamProps = Partial<
  Pick<
    ComponentProps<typeof PullRequestDetailPanel>,
    "headerExtension" | "stripExtension" | "contentExtension" | "extensionTabs"
  >
>;

function surfacePropsFor(variant: PrRecipeSurfaceVariant, onLaunch: Launch): PanelSeamProps {
  switch (variant) {
    case "none":
      return {};
    case "header-launch":
      return { headerExtension: <HeaderLaunchButtons onLaunch={onLaunch} /> };
    case "strip-triggers":
      return { stripExtension: <StripTriggerChips onLaunch={onLaunch} /> };
    case "summary-section":
      return { contentExtension: <SummarySection onLaunch={onLaunch} /> };
    case "actions-tab":
      return {
        extensionTabs: [
          {
            id: "actions",
            label: "Actions",
            content: <ActionsTabContent onLaunch={onLaunch} />,
          },
        ],
      };
  }
}

/**
 * The real pull-request detail panel — header, tabs, summary document, timeline — with the
 * recipe surface the story asks for. Data arrives through the storybook-only seam in
 * `pullRequests.storyMock.ts` (the read families resolve to the sample pull request).
 */
export function PrDetailRecipeFrame({
  variant,
  onLaunched,
}: {
  variant: PrRecipeSurfaceVariant;
  onLaunched: Launch;
}) {
  return (
    <PullRequestDetailPanel
      environmentId={STORY_ENVIRONMENT_ID}
      reference={PR_REFERENCE}
      context="page"
      {...surfacePropsFor(variant, onLaunched)}
    />
  );
}
