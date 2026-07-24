import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";

import type { T3workKickoffLaunchConfig } from "~/t3work/t3work-kickoffLaunchConfig";
import type { T3workSelectedRecipeQuickStart } from "~/t3work/t3work-recipeQuickStartLaunch";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";
import type { T3workThreadToolId } from "~/t3work/t3work-types";

export type T3workKickoffComposerProps = {
  prefillText?: string;
  selectedRecipe?: T3workSelectedRecipeQuickStart;
  onClearSelectedRecipe?: () => void;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  /** Workspace root used as the `@` path-search cwd. */
  workspaceRoot?: string;
  /** Surface-applicable recipes offered as `/<slashAlias>` launchers. */
  slashRecipes?: ReadonlyArray<T3workSidecarRecipeQuickStart>;
  onSelectSlashRecipe?: (recipe: T3workSidecarRecipeQuickStart) => void;
  onSubmit: (
    text: string,
    selection: ModelSelection,
    runtimeMode: RuntimeMode,
    interactionMode: ProviderInteractionMode,
    selectedToolIds: ReadonlyArray<T3workThreadToolId>,
  ) => void;
};

export type T3workKickoffComposerHandle = {
  getLaunchConfig: () => T3workKickoffLaunchConfig;
};
