import { useEffect, useMemo, useState } from "react";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { ProjectThread } from "~/t3team/t3team-types";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import { mergeContextAttachmentsById } from "~/t3team/t3team-contextAttachmentMerge";
import { T3TeamSidecarComposition } from "~/t3team/t3team-SidecarComposition";
import { applyT3TeamRecipeQuickStartLaunchCustomization } from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeInput } from "~/t3team/t3team-sidecarRecipeTypes";
import {
  useT3TeamStagedComposerAction,
  useT3TeamStagedComposerActionStore,
} from "~/t3team/t3team-stagedComposerActionStore";
import {
  TicketKickoffPanelFooter,
  type T3TeamKickoffComposerRenderer,
  type T3TeamKickoffPanelKickoff,
} from "~/t3team/t3team-TicketKickoffPanelFooter";
import { useBundledSidecarRecipeLaunch } from "~/t3team/t3team-useBundledSidecarRecipeLaunch";

type TicketKickoffPanelProps = {
  profileId?: string;
  projectId: string;
  /** Present on the work item surface. It is half the key an action staged from the content column
   * is filed under, so without it nothing can be preselected here. */
  ticketId?: string;
  issueThreads: ProjectThread[];
  quickStartRecipeInput: T3TeamSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  injectedContextAttachments?: ReadonlyArray<T3TeamContextAttachment>;
  onOpenThread: (threadId: string) => void;
  onKickoff: T3TeamKickoffPanelKickoff;
  renderComposer: T3TeamKickoffComposerRenderer;
};

export function TicketKickoffPanel({
  profileId,
  projectId,
  ticketId,
  issueThreads,
  quickStartRecipeInput,
  injectedContextAttachments,
  onOpenThread,
  onKickoff,
  renderComposer,
}: TicketKickoffPanelProps) {
  const environmentId = usePrimaryEnvironmentId();
  const stagedTarget = useMemo(
    () => (ticketId ? { projectId, ticketId } : undefined),
    [projectId, ticketId],
  );
  const stagedAction = useT3TeamStagedComposerAction(stagedTarget);
  const removeStagedComment = useT3TeamStagedComposerActionStore((state) => state.removeComment);
  const clearStagedAction = useT3TeamStagedComposerActionStore((state) => state.clear);
  const [localContextAttachments, setLocalContextAttachments] = useState<
    ReadonlyArray<T3TeamContextAttachment>
  >([]);
  const [dismissedAttachmentIds, setDismissedAttachmentIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const { clearSelectedRecipe, composerRef, selectedRecipe, sidecarHost } =
    useBundledSidecarRecipeLaunch({
      backend: quickStartRecipeInput.backend,
      environmentId,
      projectId,
      surface: "workitem.detail.sidepanel",
      projectWorkspaceRoot: quickStartRecipeInput.project.workspace?.rootPath,
      openThread: onOpenThread,
      buildSelectedRecipe: (recipe, customization) => ({
        recipe: applyT3TeamRecipeQuickStartLaunchCustomization(recipe, customization),
        ...(customization ? { customization } : {}),
      }),
      createThread: async ({ kickoffMessage, kickoffWorkflow, launchConfig }) =>
        (await Promise.resolve(
          onKickoff(
            kickoffMessage,
            false,
            launchConfig.selection,
            launchConfig.runtimeMode,
            launchConfig.interactionMode,
            launchConfig.selectedToolIds,
            localContextAttachments,
            kickoffWorkflow,
          ),
        )) as string | undefined,
      onLaunched: () => {
        setLocalContextAttachments([]);
        setDismissedAttachmentIds(new Set());
      },
    });

  useEffect(() => {
    if (!injectedContextAttachments || injectedContextAttachments.length === 0) {
      return;
    }
    setLocalContextAttachments((current) =>
      mergeContextAttachmentsById({
        current,
        incoming: injectedContextAttachments,
        dismissedIds: dismissedAttachmentIds,
      }),
    );
  }, [dismissedAttachmentIds, injectedContextAttachments]);

  const removeLocalContextAttachment = (id: string) => {
    setLocalContextAttachments((current) => current.filter((a) => a.id !== id));
    setDismissedAttachmentIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const clearPanelState = () => {
    setLocalContextAttachments([]);
    setDismissedAttachmentIds(new Set());
    clearSelectedRecipe();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1">
        <T3TeamSidecarComposition
          surface="workitem.detail.sidepanel"
          profileId={profileId}
          host={sidecarHost}
          resolveSectionProps={(sectionId) => {
            if (sectionId === "quick-starts") {
              return {
                recipeInput: quickStartRecipeInput,
                ...(selectedRecipe?.recipe.id
                  ? { selectedRecipeId: selectedRecipe.recipe.id }
                  : {}),
              };
            }

            if (sectionId === "recent-conversations") {
              return {
                threads: issueThreads,
                emptyMessage: "No conversations started for this ticket yet.",
                showSearch: false,
                showCount: false,
              };
            }

            return undefined;
          }}
        />
      </ScrollArea>

      <TicketKickoffPanelFooter
        composerRef={composerRef}
        contextAttachments={localContextAttachments}
        stagedAction={stagedAction}
        selectedRecipe={selectedRecipe}
        onRemoveContextAttachment={removeLocalContextAttachment}
        onRemoveStagedComment={(commentId) => {
          if (stagedTarget) removeStagedComment(stagedTarget, commentId);
        }}
        onClearStagedAction={() => {
          if (stagedTarget) clearStagedAction(stagedTarget);
        }}
        onClearSelectedRecipe={clearSelectedRecipe}
        onKickoff={onKickoff}
        onSubmitted={clearPanelState}
        renderComposer={renderComposer}
      />
    </div>
  );
}
