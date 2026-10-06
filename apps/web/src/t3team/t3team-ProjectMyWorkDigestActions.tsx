import type { MouseEvent } from "react";

import {
  resolveDigestRecipe,
  useDigestRecipeCatalog,
  type DigestRecipeCatalog,
} from "~/t3team/t3team-digestRecipeCatalog";
import { requestDigestRecipeLaunch } from "~/t3team/t3team-digestRecipeLaunchStore";
import type { DigestItemAction } from "~/t3team/t3team-projectMyWorkDigestPlan";

const PILL_CLASS =
  "shrink-0 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium leading-none text-foreground/85 hover:bg-accent";

/**
 * The actions a row can actually offer: links always, a recipe starter only when it has a PR to
 * launch against and its recipe is in the loaded catalog for that PR's project, so a recipe that
 * is not installed (or a view with no kickoff composer) never shows a dead button.
 */
export function availableDigestItemActions(
  actions: readonly DigestItemAction[],
  catalog: DigestRecipeCatalog | null,
): readonly DigestItemAction[] {
  return actions.filter((action) =>
    action.recipe
      ? action.scope !== undefined &&
        resolveDigestRecipe(catalog, action.recipe, action.scope.projectId) !== null
      : action.href !== undefined,
  );
}

/** A recipe starter (dashed border): stages its recipe in the kickoff composer, scoped to the PR. */
function DigestRecipePill({ action }: { action: DigestItemAction }) {
  const { recipe: recipeId, scope } = action;
  if (!recipeId || !scope) return null;
  const stage = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    requestDigestRecipeLaunch({ recipeId, scope });
  };
  return (
    <button type="button" className={`${PILL_CLASS} border-dashed border-border`} onClick={stage}>
      {action.label}
    </button>
  );
}

/** One next-step pill on a digest row. Solid border = plain link (thread / PR / CI). */
function DigestActionPill({ action }: { action: DigestItemAction }) {
  if (action.recipe) return <DigestRecipePill action={action} />;
  if (!action.href) return null;
  return (
    <a
      href={action.href}
      target="_blank"
      rel="noreferrer"
      className={`${PILL_CLASS} border-border/70`}
      onClick={(e) => e.stopPropagation()}
    >
      {action.label}
    </a>
  );
}

/**
 * The row's next-step cluster: its own line at the bottom of the row, right-aligned and revealed
 * on hover or keyboard focus. It is IN the row's flow (never absolutely positioned), so it can
 * not cover the PR chips or the why-text; the space is reserved so revealing it does not shift
 * the list. Wraps instead of overflowing on a narrow lane; always visible on small screens,
 * which have no hover (including touch screens wider than `sm`).
 */
export function DigestItemActions({ actions }: { actions: readonly DigestItemAction[] }) {
  const available = availableDigestItemActions(actions, useDigestRecipeCatalog());
  if (available.length === 0) return null;
  return (
    <div className="pointer-events-none mt-1.5 flex min-w-0 flex-wrap items-center justify-end gap-1.5 opacity-0 transition-opacity duration-150 ease-out group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
      {available.map((action) => (
        <DigestActionPill
          key={`${action.label}|${action.href ?? action.scope?.changeRequest.repo ?? ""}`}
          action={action}
        />
      ))}
    </div>
  );
}
