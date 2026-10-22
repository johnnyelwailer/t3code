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
  /** Project whose default model and provider enablement apply; absent for project-less surfaces. */
  projectId?: string;
  /**
   * Stable key the unsent text is persisted under (survives reload/restart).
   * Defaults to `project:<projectId>` (or `project:all`); surfaces scoped to a
   * single work item pass their own, e.g. `ticket:<projectId>:<ticketId>`.
   */
  draftKey?: string;
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
