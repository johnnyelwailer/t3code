/**
 * Adds the project's recipes to the chat composer's `/` menu, after the host's own items: a recipe
 * never outranks or shadows a built-in, provider command or skill (16-action-recipes.md, "Menu
 * grouping"). Items come from the already-loaded catalog; nothing here fetches.
 */
import type { ServerProvider } from "@t3tools/contracts";

import type { ComposerSlashCommand, ComposerTrigger } from "~/composer-logic";
import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import {
  t3teamRecipeAttachDisabledReason,
  type T3TeamComposerRecipeTarget,
} from "~/t3team/composer/t3team-composerAttachedRecipeStore";
import { useT3TeamComposerRecipeCatalog } from "~/t3team/composer/t3team-composerRecipeCatalogStore";
import { buildT3TeamRecipeSlashItems } from "~/t3team/composer/t3team-composerRecipeSlashItems";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

const HOST_SLASH_COMMANDS: ReadonlyArray<ComposerSlashCommand> = [
  "model",
  "plan",
  "default",
  "side",
  "btw",
];

export function appendT3TeamRecipeMenuItems(input: {
  readonly items: ComposerCommandItem[];
  readonly trigger: ComposerTrigger | null;
  readonly recipes: ReadonlyArray<T3TeamSidecarRecipeQuickStart>;
  readonly providerSlashCommands: ServerProvider["slashCommands"];
  /** Shown in place of each recipe's title when it cannot be attached here, as `/side` does. */
  readonly disabledReason?: string | null;
}): ComposerCommandItem[] {
  if (input.trigger?.kind !== "slash-command" || input.recipes.length === 0) {
    return input.items;
  }
  const recipeItems = buildT3TeamRecipeSlashItems({
    recipes: input.recipes,
    reservedAliases: [
      ...HOST_SLASH_COMMANDS,
      ...input.providerSlashCommands.map((command) => command.name),
    ],
    query: input.trigger.query,
  });
  if (recipeItems.length === 0) return input.items;
  const disabledReason = input.disabledReason ?? null;
  return [
    ...input.items,
    ...(disabledReason === null
      ? recipeItems
      : recipeItems.map((item) => ({ ...item, description: disabledReason }))),
  ];
}

export function useT3TeamComposerRecipeMenuItems(input: {
  readonly items: ComposerCommandItem[];
  readonly trigger: ComposerTrigger | null;
  readonly projectId: string | null;
  readonly target: T3TeamComposerRecipeTarget;
  readonly providerSlashCommands: ServerProvider["slashCommands"];
}): ComposerCommandItem[] {
  const recipes = useT3TeamComposerRecipeCatalog(input.projectId);
  return appendT3TeamRecipeMenuItems({
    items: input.items,
    trigger: input.trigger,
    recipes,
    providerSlashCommands: input.providerSlashCommands,
    disabledReason: t3teamRecipeAttachDisabledReason(input.target),
  });
}
