import { useEffect, useState } from "react";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { ProjectThread, T3TeamThreadToolId } from "~/t3team/t3team-types";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import { mergeContextAttachmentsById } from "~/t3team/t3team-contextAttachmentMerge";
import { ContextAttachmentChip } from "~/t3team/components/t3team-ContextAttachmentChip";
import { T3TeamSidecarComposition } from "~/t3team/t3team-SidecarComposition";
import {
  applyT3TeamRecipeQuickStartLaunchCustomization,
  buildT3TeamSelectedRecipeKickoffLaunch,
  type T3TeamSelectedRecipeQuickStart,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeInput } from "~/t3team/t3team-sidecarRecipeTypes";
import { type T3TeamKickoffComposerHandle } from "~/t3team/t3team-TicketKickoffComposer";
import { useBundledSidecarRecipeLaunch } from "~/t3team/t3team-useBundledSidecarRecipeLaunch";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

type TicketKickoffPanelProps = {
  profileId?: string;
  projectId: string;
  issueThreads: ProjectThread[];
  quickStartRecipeInput: T3TeamSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  injectedContextAttachments?: ReadonlyArray<T3TeamContextAttachment>;
  onOpenThread: (threadId: string) => void;
  onKickoff: (
    instruction: string,
    kickoffPending: boolean | undefined,
    selection: ModelSelection,
    runtimeMode: RuntimeMode,
    interactionMode: ProviderInteractionMode,
    selectedToolIds: ReadonlyArray<T3TeamThreadToolId>,
    contextAttachments: ReadonlyArray<T3TeamContextAttachment>,
    kickoffWorkflow?: T3TeamKickoffWorkflow,
  ) => void;
  renderComposer: (props: {
    composerRef: React.RefObject<T3TeamKickoffComposerHandle | null>;
    prefillText?: string;
    selectedRecipe?: T3TeamSelectedRecipeQuickStart;
    onClearSelectedRecipe?: () => void;
    onSubmit: (
      text: string,
      selection: ModelSelection,
      runtimeMode: RuntimeMode,
      interactionMode: ProviderInteractionMode,
      selectedToolIds: ReadonlyArray<T3TeamThreadToolId>,
    ) => void;
  }) => React.ReactNode;
};

export function TicketKickoffPanel({
  profileId,
  projectId,
  issueThreads,
  quickStartRecipeInput,
  injectedContextAttachments,
  onOpenThread,
  onKickoff,
  renderComposer,
}: TicketKickoffPanelProps) {
  const environmentId = usePrimaryEnvironmentId();
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

      <div className="shrink-0 border-t border-border bg-background/75 p-3 sm:p-4">
        {localContextAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {localContextAttachments.map((a) => (
              <ContextAttachmentChip
                key={a.id}
                attachment={a}
                onRemove={removeLocalContextAttachment}
              />
            ))}
          </div>
        )}
        {renderComposer({
          composerRef,
          ...(selectedRecipe ? { selectedRecipe } : {}),
          onClearSelectedRecipe: clearSelectedRecipe,
          onSubmit: (text, selection, runtimeMode, interactionMode, selectedToolIds) => {
            const kickoff = selectedRecipe
              ? buildT3TeamSelectedRecipeKickoffLaunch({
                  selectedRecipe,
                  customMessage: text,
                })
              : {
                  kickoffMessage: text,
                  kickoffPending: true,
                };
            onKickoff(
              kickoff.kickoffMessage,
              kickoff.kickoffPending,
              selection,
              runtimeMode,
              interactionMode,
              selectedToolIds,
              localContextAttachments,
              selectedRecipe?.recipe.workflow,
            );
            clearPanelState();
          },
        })}
      </div>
    </div>
  );
}
