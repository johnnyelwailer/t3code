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

import { T3TeamSidecarSectionItemMenu } from "~/t3team/t3team-sidecarSectionMenu";
import {
  T3TeamSidecarSectionErrorBoundary,
  T3TeamSidecarSectionFrame,
} from "~/t3team/t3team-sidecarSectionFrame";
import {
  buildT3TeamSidecarItemMenuEntries,
  buildT3TeamSidecarSectionHeaderMenuEntries,
} from "~/t3team/t3team-sidecarSectionMenuActions";
import {
  getT3TeamSidecarItemId,
  getT3TeamSidecarItemLabel,
  getT3TeamSidecarItemSourcePath,
  mergeT3TeamSidecarSectionProps,
  runT3TeamSidecarDeclaredAction,
} from "~/t3team/t3team-sidecarSectionShellHelpers";
import {
  getT3TeamSidecarSectionComponent,
  resolveT3TeamSidecarSectionIsEmpty,
} from "~/t3team/t3team-sidecarSectionRegistry";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";
import type { useRunT3TeamDeterministicWorkflowLaunch } from "~/t3team/t3team-inlineRecipeLaunch";
import {
  buildT3TeamSidecarItemResetLaunch,
  buildT3TeamSidecarSectionResetLaunch,
} from "~/t3team/t3team-sidecarPersonalizationReset";

export function T3TeamSidecarSectionInstance({
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
  readonly runWorkflowLaunch: ReturnType<typeof useRunT3TeamDeterministicWorkflowLaunch>;
  readonly setCollapsed: (sectionId: string, collapsed: boolean) => void;
  readonly hideSection: (sectionId: string) => void;
  readonly moveSection: (sectionId: string, direction: "up" | "down") => void;
  readonly hideItem: (sectionId: string, itemId: string) => void;
  readonly pinItem: (sectionId: string, itemId: string) => void;
  readonly unpinItem: (sectionId: string, itemId: string) => void;
}) {
  const SectionComponent = getT3TeamSidecarSectionComponent(definition.component);
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
  const sectionResetLaunch = buildT3TeamSidecarSectionResetLaunch({
    surface,
    sectionId: definition.id,
    sectionTitle: definition.title,
    defaultComposition,
    personalization,
  });
  const runDeclaredAction = (
    action: Parameters<typeof runT3TeamSidecarDeclaredAction>[0]["action"],
    itemId?: string,
  ) => {
    startTransition(() => {
      void runT3TeamSidecarDeclaredAction({
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
  const mergedSectionProps = mergeT3TeamSidecarSectionProps(resolveSectionProps?.(definition.id), {
    orderItemIds: (itemIds: ReadonlyArray<string>) =>
      resolveSidecarSectionItemOrder({
        itemIds,
        personalization: sectionItemPersonalization,
      }),
    wrapItem: (item: unknown, content: ReactNode) => {
      const itemId = getT3TeamSidecarItemId(item);
      const itemLabel = getT3TeamSidecarItemLabel(item);
      const sourcePath = getT3TeamSidecarItemSourcePath(item);
      if (!itemId) {
        return content;
      }
      const itemResetLaunch = buildT3TeamSidecarItemResetLaunch({
        surface,
        sectionId: definition.id,
        itemId,
        itemTitle: itemLabel,
        personalization,
      });

      return (
        <T3TeamSidecarSectionItemMenu
          entries={buildT3TeamSidecarItemMenuEntries({
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
        </T3TeamSidecarSectionItemMenu>
      );
    },
  });

  if (resolveT3TeamSidecarSectionIsEmpty(definition.component, mergedSectionProps) === true) {
    return null;
  }

  return (
    <T3TeamSidecarSectionFrame
      sectionId={definition.id}
      title={definition.title}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed(definition.id, !collapsed)}
      menuEntries={buildT3TeamSidecarSectionHeaderMenuEntries({
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
      <T3TeamSidecarSectionErrorBoundary fallback={fallback}>
        {SectionComponent ? <SectionComponent host={host} props={mergedSectionProps} /> : fallback}
      </T3TeamSidecarSectionErrorBoundary>
    </T3TeamSidecarSectionFrame>
  );
}
