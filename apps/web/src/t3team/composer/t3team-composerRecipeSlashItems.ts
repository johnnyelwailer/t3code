import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";

import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import {
  resolveT3TeamRecipeSlashAliases,
  type T3TeamRecipeSlashAliasEntry,
} from "~/t3team/composer/t3team-composerRecipeSlashAlias";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

/**
 * The `recipe-slash-command` menu item kind. It is a member of
 * `ComposerCommandItem`, so `ComposerCommandMenu` renders it alongside the host
 * kinds — see docs/t3team-mvp/16-action-recipes.md#composer-slash-command-launchers.
 */
export type T3TeamRecipeSlashCommandItem = Extract<
  ComposerCommandItem,
  { type: "recipe-slash-command" }
>;

/**
 * Every menu item kind a t3team composer surface can render. Kept as an alias
 * so surfaces keep reading a t3team-owned name, but it is now exactly the
 * upstream union — there is one menu item type, not two.
 */
export type T3TeamComposerMenuItem = ComposerCommandItem;

function toItem(entry: T3TeamRecipeSlashAliasEntry): T3TeamRecipeSlashCommandItem {
  return {
    id: `recipe-slash-command:${entry.alias}`,
    type: "recipe-slash-command",
    alias: entry.alias,
    recipe: entry.recipe,
    label: `/${entry.alias}`,
    description: entry.recipe.title,
  };
}

/**
 * Scores an alias entry: alias first, then id, then title — same scoring shape
 * as provider slash commands (`composerSlashCommandSearch.ts`).
 */
function scoreEntry(entry: T3TeamRecipeSlashAliasEntry, query: string): number | null {
  const scores = [
    scoreQueryMatch({
      value: entry.alias.toLowerCase(),
      query,
      exactBase: 0,
      prefixBase: 2,
      boundaryBase: 4,
      includesBase: 6,
      fuzzyBase: 100,
      boundaryMarkers: ["-", "_", "/"],
    }),
    scoreQueryMatch({
      value: entry.recipe.id.toLowerCase(),
      query,
      exactBase: 10,
      prefixBase: 12,
      boundaryBase: 14,
      includesBase: 16,
      boundaryMarkers: ["-", "_", "/"],
    }),
    scoreQueryMatch({
      value: entry.recipe.title.toLowerCase(),
      query,
      exactBase: 20,
      prefixBase: 22,
      boundaryBase: 24,
      includesBase: 26,
    }),
  ].filter((score): score is number => score !== null);
  return scores.length === 0 ? null : Math.min(...scores);
}

/**
 * Builds the `Recipes` group of the composer `/` menu for the given catalog.
 * The empty-query view lists every applicable recipe in catalog order.
 */
export function buildT3TeamRecipeSlashItems(input: {
  readonly recipes: ReadonlyArray<T3TeamSidecarRecipeQuickStart>;
  readonly reservedAliases: ReadonlyArray<string>;
  readonly query: string;
  readonly limit?: number;
}): ReadonlyArray<T3TeamRecipeSlashCommandItem> {
  const entries = resolveT3TeamRecipeSlashAliases({
    recipes: input.recipes,
    reservedAliases: input.reservedAliases,
  });
  const normalizedQuery = normalizeSearchQuery(input.query, { trimLeadingPattern: /^\/+/ });
  if (!normalizedQuery) {
    return entries.map(toItem);
  }

  const limit = input.limit ?? Number.POSITIVE_INFINITY;
  const ranked: Array<{ item: T3TeamRecipeSlashAliasEntry; score: number; tieBreaker: string }> =
    [];
  for (const entry of entries) {
    const score = scoreEntry(entry, normalizedQuery);
    if (score === null) {
      continue;
    }
    insertRankedSearchResult(ranked, { item: entry, score, tieBreaker: entry.alias }, limit);
  }
  return ranked.map((result) => toItem(result.item));
}
