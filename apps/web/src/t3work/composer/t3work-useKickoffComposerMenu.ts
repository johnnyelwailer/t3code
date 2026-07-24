import { useCallback, useMemo } from "react";
import type { ProviderInteractionMode, ServerProvider } from "@t3tools/contracts";

import type { ComposerTrigger } from "~/composer-logic";
import { usePrimaryEnvironmentId } from "~/state/environments";
import type { ComposerPromptEditorHandle } from "~/components/ComposerPromptEditor";
import { T3WORK_COMPOSER_BUILT_IN_SLASH_COMMANDS } from "~/t3work/composer/t3work-composerMenuItems";
import { buildT3workRecipeSlashItems } from "~/t3work/composer/t3work-composerRecipeSlashItems";
import { useT3workComposerCommandMenu } from "~/t3work/composer/t3work-useComposerCommandMenu";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

/**
 * The kickoff composer has no thread-scoped model picker, so `/model` is not
 * offered; `/plan` and `/default` map onto the interaction-mode toggle.
 */
const KICKOFF_BUILT_IN_SLASH_COMMANDS = T3WORK_COMPOSER_BUILT_IN_SLASH_COMMANDS.filter(
  (builtIn) => builtIn.command !== "model",
);

export type T3workKickoffComposerMenuInput = {
  readonly selectedProvider: ServerProvider | undefined;
  readonly workspaceRoot: string | null;
  readonly editorRef: React.RefObject<ComposerPromptEditorHandle | null>;
  readonly text: string;
  readonly cursor: number;
  readonly setText: (next: string) => void;
  readonly setCursor: (next: number) => void;
  readonly setInteractionMode: (mode: ProviderInteractionMode) => void;
  /** Surface-applicable recipe catalog offered as `/`-menu launchers. */
  readonly slashRecipes?: ReadonlyArray<T3workSidecarRecipeQuickStart>;
  readonly onSelectRecipe?: (recipe: T3workSidecarRecipeQuickStart) => void;
};

export function useT3workKickoffComposerMenu(input: T3workKickoffComposerMenuInput) {
  const environmentId = usePrimaryEnvironmentId();
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
      return buildT3workRecipeSlashItems({
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

  return useT3workComposerCommandMenu({
    sources,
    pathSearch: { environmentId: environmentId ?? null, cwd: input.workspaceRoot },
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
