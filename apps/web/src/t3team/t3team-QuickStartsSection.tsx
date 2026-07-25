import type { BackendApi } from "~/t3team/backend/t3team-types";
import { T3TeamKickoffRecipeList } from "~/t3team/t3team-KickoffRecipeList";
import {
  orderT3TeamSidecarSectionItems,
  type T3TeamSidecarSectionShellProps,
} from "~/t3team/t3team-sidecarSectionShellProps";
import { useT3TeamSidecarRecipeQuickStarts } from "~/t3team/t3team-sidecarRecipes";
import type { T3TeamSidecarRecipeInput } from "~/t3team/t3team-sidecarRecipeTypes";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";

export type QuickStartsSectionProps = {
  readonly recipeInput: T3TeamSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  readonly selectedRecipeId?: string | undefined;
  readonly shell?: T3TeamSidecarSectionShellProps<T3TeamSidecarRecipeQuickStart> | undefined;
};

function isQuickStartsSectionProps(props: unknown): props is QuickStartsSectionProps {
  return typeof props === "object" && props !== null && "recipeInput" in props;
}

function QuickStartsSectionContent({
  host,
  sectionProps,
}: {
  host: SidecarSectionHost;
  sectionProps: QuickStartsSectionProps;
}) {
  const quickStarts = useT3TeamSidecarRecipeQuickStarts(sectionProps.recipeInput);
  const orderedQuickStarts = orderT3TeamSidecarSectionItems({
    items: quickStarts,
    getItemId: (quickStart) => quickStart.id,
    shell: sectionProps.shell,
  });

  return (
    <T3TeamKickoffRecipeList
      recipes={orderedQuickStarts}
      {...(sectionProps.selectedRecipeId
        ? { selectedRecipeId: sectionProps.selectedRecipeId }
        : {})}
      onSelectRecipe={(recipe, customization) => host.stageKickoff(recipe, customization)}
      renderRecipe={
        sectionProps.shell?.wrapItem
          ? (recipe, content) => sectionProps.shell?.wrapItem?.(recipe, content) ?? content
          : undefined
      }
    />
  );
}

export function T3TeamQuickStartsSection({
  host,
  props,
}: {
  host: SidecarSectionHost;
  props?: unknown;
}) {
  if (!isQuickStartsSectionProps(props)) {
    return null;
  }

  return <QuickStartsSectionContent host={host} sectionProps={props} />;
}
