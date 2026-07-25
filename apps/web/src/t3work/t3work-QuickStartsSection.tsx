import type { BackendApi } from "~/t3work/backend/t3work-types";
import { T3workKickoffRecipeList } from "~/t3work/t3work-KickoffRecipeList";
import {
  orderT3workSidecarSectionItems,
  type T3workSidecarSectionShellProps,
} from "~/t3work/t3work-sidecarSectionShellProps";
import { useT3workSidecarRecipeQuickStarts } from "~/t3work/t3work-sidecarRecipes";
import type { T3workSidecarRecipeInput } from "~/t3work/t3work-sidecarRecipeTypes";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";
import type { SidecarSectionHost } from "~/t3work/t3work-sidecarSectionHost";

export type QuickStartsSectionProps = {
  readonly recipeInput: T3workSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  /**
   * Catalog the host already resolved for this surface. Hosts that render both
   * this section and a composer slash menu (the project dashboard) pass their
   * single `useT3workSidecarRecipeQuickStarts` result so the mount performs one
   * `discoverRecipes` round-trip instead of two. Hosts that have no other
   * consumer omit it and the section resolves the catalog itself.
   */
  readonly quickStarts?: ReadonlyArray<T3workSidecarRecipeQuickStart> | undefined;
  readonly selectedRecipeId?: string | undefined;
  readonly shell?: T3workSidecarSectionShellProps<T3workSidecarRecipeQuickStart> | undefined;
};

function isQuickStartsSectionProps(props: unknown): props is QuickStartsSectionProps {
  return typeof props === "object" && props !== null && "recipeInput" in props;
}

function QuickStartsSectionList({
  host,
  sectionProps,
  quickStarts,
}: {
  host: SidecarSectionHost;
  sectionProps: QuickStartsSectionProps;
  quickStarts: ReadonlyArray<T3workSidecarRecipeQuickStart>;
}) {
  const orderedQuickStarts = orderT3workSidecarSectionItems({
    items: quickStarts,
    getItemId: (quickStart) => quickStart.id,
    shell: sectionProps.shell,
  });

  return (
    <T3workKickoffRecipeList
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

function QuickStartsSectionContent({
  host,
  sectionProps,
}: {
  host: SidecarSectionHost;
  sectionProps: QuickStartsSectionProps;
}) {
  const quickStarts = useT3workSidecarRecipeQuickStarts(sectionProps.recipeInput);

  return (
    <QuickStartsSectionList host={host} sectionProps={sectionProps} quickStarts={quickStarts} />
  );
}

export function T3workQuickStartsSection({
  host,
  props,
}: {
  host: SidecarSectionHost;
  props?: unknown;
}) {
  if (!isQuickStartsSectionProps(props)) {
    return null;
  }

  // Whether the host supplies the catalog is a property of the host, not of
  // render-time state, so the branch never swaps component identity mid-mount.
  return props.quickStarts ? (
    <QuickStartsSectionList host={host} sectionProps={props} quickStarts={props.quickStarts} />
  ) : (
    <QuickStartsSectionContent host={host} sectionProps={props} />
  );
}
