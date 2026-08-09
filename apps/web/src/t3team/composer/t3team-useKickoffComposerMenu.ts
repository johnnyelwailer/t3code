import { useCallback, useMemo } from "react";
import type { ProviderInteractionMode, ServerProvider } from "@t3tools/contracts";

import type { ComposerTrigger } from "~/composer-logic";
import type { ComposerPromptEditorHandle } from "~/components/ComposerPromptEditor";
import { useT3TeamKickoffPathSearchScope } from "~/t3team/composer/t3team-kickoffPathSearchScope";
import { T3TEAM_COMPOSER_BUILT_IN_SLASH_COMMANDS } from "~/t3team/composer/t3team-composerMenuItems";
import { buildT3TeamRecipeSlashItems } from "~/t3team/composer/t3team-composerRecipeSlashItems";
import { useT3TeamComposerCommandMenu } from "~/t3team/composer/t3team-useComposerCommandMenu";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

/**
 * The kickoff composer has no thread-scoped model picker, so `/model` is not
 * offered; `/plan` and `/default` map onto the interaction-mode toggle.
 */
const KICKOFF_BUILT_IN_SLASH_COMMANDS = T3TEAM_COMPOSER_BUILT_IN_SLASH_COMMANDS.filter(
  (builtIn) => builtIn.command !== "model",
);

export type T3TeamKickoffComposerMenuInput = {
  readonly selectedProvider: ServerProvider | undefined;
  readonly workspaceRoot: string | null;
  readonly editorRef: React.RefObject<ComposerPromptEditorHandle | null>;
  readonly text: string;
  readonly cursor: number;
  readonly setText: (next: string) => void;
  readonly setCursor: (next: number) => void;
  readonly setInteractionMode: (mode: ProviderInteractionMode) => void;
  /** Surface-applicable recipe catalog offered as `/`-menu launchers. */
  readonly slashRecipes?: ReadonlyArray<T3TeamSidecarRecipeQuickStart>;
  readonly onSelectRecipe?: (recipe: T3TeamSidecarRecipeQuickStart) => void;
};

export function useT3TeamKickoffComposerMenu(input: T3TeamKickoffComposerMenuInput) {
  const pathSearch = useT3TeamKickoffPathSearchScope(input.workspaceRoot);
  const provider = input.selectedProvider;
  const sources = useMemo(
    () => ({
      builtInSlashCommands: KICKOFF_BUILT_IN_SLASH_COMMANDS,
      provider: provider?.driver ?? null,
      providerSlashCommands: provider?.slashCommands ?? [],
      skills: provider?.skills ?? [],
    }),
    [provider],
  );

  const slashRecipes = input.slashRecipes;
  const buildExtraItems = useCallback(
    (trigger: ComposerTrigger) => {
      if (trigger.kind !== "slash-command" || !slashRecipes || slashRecipes.length === 0) {
        return [];
      }
      return buildT3TeamRecipeSlashItems({
        recipes: slashRecipes,
        reservedAliases: [
          ...sources.builtInSlashCommands.map((builtIn) => builtIn.command),
          ...sources.providerSlashCommands.map((command) => command.name),
        ],
        query: trigger.query,
      });
    },
    [slashRecipes, sources],
  );

  return useT3TeamComposerCommandMenu({
    sources,
    pathSearch,
    buildExtraItems,
    readSnapshot: () => {
      const snapshot = input.editorRef.current?.readSnapshot();
      return snapshot ?? { value: input.text, expandedCursor: input.cursor };
    },
    applyText: (next) => {
      input.setText(next.text);
      input.setCursor(next.cursor);
      if (next.focusEditorAfterReplace) {
        window.requestAnimationFrame(() => {
          input.editorRef.current?.focusAt(next.cursor);
        });
      }
    },
    onSelectionEffect: (effect) => {
      if (effect.type === "built-in-slash-command") {
        input.setInteractionMode(effect.command === "plan" ? "plan" : "default");
        return;
      }
      if (effect.type === "select-recipe") {
        input.onSelectRecipe?.(effect.recipe);
      }
    },
  });
}
