import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";

import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import {
  resolveT3workRecipeSlashAliases,
  type T3workRecipeSlashAliasEntry,
} from "~/t3work/composer/t3work-composerRecipeSlashAlias";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

/**
 * The `recipe-slash-command` menu item kind. Unlike the four upstream kinds it
 * selects host state (`setSelectedRecipe`) instead of mutating editor text —
 * see docs/t3work-mvp/16-action-recipes.md#composer-slash-command-launchers.
 */
export type T3workRecipeSlashCommandItem = {
  readonly id: string;
  readonly type: "recipe-slash-command";
  readonly alias: string;
  readonly recipe: T3workSidecarRecipeQuickStart;
  readonly label: string;
  readonly description: string;
};

/** Every menu item kind a t3work composer surface can render. */
export type T3workComposerMenuItem = ComposerCommandItem | T3workRecipeSlashCommandItem;

function toItem(entry: T3workRecipeSlashAliasEntry): T3workRecipeSlashCommandItem {
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
function scoreEntry(entry: T3workRecipeSlashAliasEntry, query: string): number | null {
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
export function buildT3workRecipeSlashItems(input: {
  readonly recipes: ReadonlyArray<T3workSidecarRecipeQuickStart>;
  readonly reservedAliases: ReadonlyArray<string>;
  readonly query: string;
  readonly limit?: number;
}): ReadonlyArray<T3workRecipeSlashCommandItem> {
  const entries = resolveT3workRecipeSlashAliases({
    recipes: input.recipes,
    reservedAliases: input.reservedAliases,
  });
  const normalizedQuery = normalizeSearchQuery(input.query, { trimLeadingPattern: /^\/+/ });
  if (!normalizedQuery) {
    return entries.map(toItem);
  }

  const limit = input.limit ?? Number.POSITIVE_INFINITY;
  const ranked: Array<{ item: T3workRecipeSlashAliasEntry; score: number; tieBreaker: string }> =
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
