/* oxlint-disable react/no-unstable-nested-components -- Existing merged lint debt; keep green while preserving behavior. */
import { startTransition, type ReactNode } from "react";
import {
  isSidecarItemPinned,
  resolveSidecarSectionItemOrder,
  resolveSidecarSectionItemPersonalization,
  type RecipeSurface,
  type SidecarCompositionSection,
  type SidecarPersonalization,
  type SidecarSectionDefinition,
} from "@t3tools/project-recipes";

import { T3workSidecarSectionItemMenu } from "~/t3work/t3work-sidecarSectionMenu";
import {
  T3workSidecarSectionErrorBoundary,
  T3workSidecarSectionFrame,
} from "~/t3work/t3work-sidecarSectionFrame";
import {
  buildT3workSidecarItemMenuEntries,
  buildT3workSidecarSectionHeaderMenuEntries,
} from "~/t3work/t3work-sidecarSectionMenuActions";
import {
  getT3workSidecarItemId,
  getT3workSidecarItemLabel,
  getT3workSidecarItemSourcePath,
  mergeT3workSidecarSectionProps,
  runT3workSidecarDeclaredAction,
} from "~/t3work/t3work-sidecarSectionShellHelpers";
import {
  getT3workSidecarSectionComponent,
  resolveT3workSidecarSectionIsEmpty,
} from "~/t3work/t3work-sidecarSectionRegistry";
import type { SidecarSectionHost } from "~/t3work/t3work-sidecarSectionHost";
import type { useRunT3workDeterministicWorkflowLaunch } from "~/t3work/t3work-inlineRecipeLaunch";
import {
  buildT3workSidecarItemResetLaunch,
  buildT3workSidecarSectionResetLaunch,
} from "~/t3work/t3work-sidecarPersonalizationReset";

export function T3workSidecarSectionInstance({
  definition,
  sectionState,
  sectionIndex,
  totalVisibleSections,
  surface,
  host,
  defaultComposition,
  personalization,
  resolveSectionProps,
  runWorkflowLaunch,
  setCollapsed,
  hideSection,
  moveSection,
  hideItem,
  pinItem,
  unpinItem,
}: {
  readonly definition: SidecarSectionDefinition;
  readonly sectionState: SidecarCompositionSection;
  readonly sectionIndex: number;
  readonly totalVisibleSections: number;
  readonly surface: RecipeSurface;
  readonly host: SidecarSectionHost;
  readonly defaultComposition: { readonly sections: ReadonlyArray<SidecarCompositionSection> };
  readonly personalization: SidecarPersonalization;
  readonly resolveSectionProps?: ((sectionId: string) => unknown) | undefined;
  readonly runWorkflowLaunch: ReturnType<typeof useRunT3workDeterministicWorkflowLaunch>;
  readonly setCollapsed: (sectionId: string, collapsed: boolean) => void;
  readonly hideSection: (sectionId: string) => void;
  readonly moveSection: (sectionId: string, direction: "up" | "down") => void;
  readonly hideItem: (sectionId: string, itemId: string) => void;
  readonly pinItem: (sectionId: string, itemId: string) => void;
  readonly unpinItem: (sectionId: string, itemId: string) => void;
}) {
  const SectionComponent = getT3workSidecarSectionComponent(definition.component);
  const collapsed = sectionState.collapsed === true;
  const fallback = (
    <p className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground/70">
      This section is unavailable right now.
    </p>
  );
  const sectionItemPersonalization = resolveSidecarSectionItemPersonalization({
    sectionId: definition.id,
    personalization,
  });
  const sectionResetLaunch = buildT3workSidecarSectionResetLaunch({
    surface,
    sectionId: definition.id,
    sectionTitle: definition.title,
    defaultComposition,
    personalization,
  });
  const runDeclaredAction = (
    action: Parameters<typeof runT3workSidecarDeclaredAction>[0]["action"],
    itemId?: string,
  ) => {
    startTransition(() => {
      void runT3workSidecarDeclaredAction({
        runWorkflowLaunch,
        sectionId: definition.id,
        sectionTitle: definition.title,
        action,
        surface,
        ...(itemId ? { itemId } : {}),
        allowedToolGroups: definition.allowedToolGroups,
      });
    });
  };
  const mergedSectionProps = mergeT3workSidecarSectionProps(resolveSectionProps?.(definition.id), {
    orderItemIds: (itemIds: ReadonlyArray<string>) =>
      resolveSidecarSectionItemOrder({
        itemIds,
        personalization: sectionItemPersonalization,
      }),
    wrapItem: (item: unknown, content: ReactNode) => {
      const itemId = getT3workSidecarItemId(item);
      const itemLabel = getT3workSidecarItemLabel(item);
      const sourcePath = getT3workSidecarItemSourcePath(item);
      if (!itemId) {
        return content;
      }
      const itemResetLaunch = buildT3workSidecarItemResetLaunch({
        surface,
        sectionId: definition.id,
        itemId,
        itemTitle: itemLabel,
        personalization,
      });

      return (
        <T3workSidecarSectionItemMenu
          entries={buildT3workSidecarItemMenuEntries({
            pinned: isSidecarItemPinned({
              itemId,
              personalization: sectionItemPersonalization,
            }),
            onPinItem: () => pinItem(definition.id, itemId),
            onUnpinItem: () => unpinItem(definition.id, itemId),
            ...(sourcePath ? { editSourcePath: sourcePath } : {}),
            onEditItem: (targetPath) => {
              void host.launchRecipe("edit-plugin-module", { targetPath });
            },
            showCustomizeItem: itemResetLaunch !== null,
            onCustomizeItem: itemResetLaunch
              ? () => {
                  startTransition(() => {
                    void runWorkflowLaunch(itemResetLaunch);
                  });
                }
              : undefined,
            onHideItem: () => hideItem(definition.id, itemId),
            declaredActions: definition.itemActions?.(item),
            onRunDeclaredAction: (action) => runDeclaredAction(action, itemId),
          })}
          label={itemLabel}
        >
          {content}
        </T3workSidecarSectionItemMenu>
      );
    },
  });

  if (resolveT3workSidecarSectionIsEmpty(definition.component, mergedSectionProps) === true) {
    return null;
  }

  return (
    <T3workSidecarSectionFrame
      sectionId={definition.id}
      title={definition.title}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed(definition.id, !collapsed)}
      menuEntries={buildT3workSidecarSectionHeaderMenuEntries({
        collapsed,
        canMoveUp: sectionIndex > 0,
        canMoveDown: sectionIndex < totalVisibleSections - 1,
        onMoveUp: () => moveSection(definition.id, "up"),
        onMoveDown: () => moveSection(definition.id, "down"),
        onToggleCollapsed: () => setCollapsed(definition.id, !collapsed),
        showResetSection: sectionResetLaunch !== null,
        onResetSection: sectionResetLaunch
          ? () => {
              startTransition(() => {
                void runWorkflowLaunch(sectionResetLaunch);
              });
            }
          : undefined,
        onHideSection: () => hideSection(definition.id),
        declaredActions: definition.sectionActions?.(),
        onRunDeclaredAction: (action) => runDeclaredAction(action),
      })}
    >
      <T3workSidecarSectionErrorBoundary fallback={fallback}>
        {SectionComponent ? <SectionComponent host={host} props={mergedSectionProps} /> : fallback}
      </T3workSidecarSectionErrorBoundary>
    </T3workSidecarSectionFrame>
  );
}
