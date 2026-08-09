import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";

import type { T3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import type { T3TeamSelectedRecipeQuickStart } from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import type { T3TeamThreadToolId } from "~/t3team/t3team-types";

export type T3TeamKickoffComposerProps = {
  prefillText?: string;
  selectedRecipe?: T3TeamSelectedRecipeQuickStart;
  onClearSelectedRecipe?: () => void;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  /** Workspace root used as the `@` path-search cwd. */
  workspaceRoot?: string;
  /** Surface-applicable recipes offered as `/<slashAlias>` launchers. */
  slashRecipes?: ReadonlyArray<T3TeamSidecarRecipeQuickStart>;
  onSelectSlashRecipe?: (recipe: T3TeamSidecarRecipeQuickStart) => void;
  onSubmit: (
    text: string,
    selection: ModelSelection,
    runtimeMode: RuntimeMode,
    interactionMode: ProviderInteractionMode,
    selectedToolIds: ReadonlyArray<T3TeamThreadToolId>,
  ) => void;
};

export type T3TeamKickoffComposerHandle = {
  getLaunchConfig: () => T3TeamKickoffLaunchConfig;
};
