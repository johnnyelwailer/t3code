import { useEffect, useState } from "react";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { ProjectThread, T3workThreadToolId } from "~/t3work/t3work-types";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import { mergeContextAttachmentsById } from "~/t3work/t3work-contextAttachmentMerge";
import { ContextAttachmentChip } from "~/t3work/components/t3work-ContextAttachmentChip";
import { T3workSidecarComposition } from "~/t3work/t3work-SidecarComposition";
import { readProjectSidecarCompositionFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { resolveT3workKickoffSectionProps } from "~/t3work/t3work-sidecarKickoffSectionProps";
import {
  applyT3workRecipeQuickStartLaunchCustomization,
  buildT3workSelectedRecipeKickoffLaunch,
  type T3workSelectedRecipeQuickStart,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import type { T3workSidecarRecipeInput } from "~/t3work/t3work-sidecarRecipeTypes";
import { type T3workKickoffComposerHandle } from "~/t3work/t3work-TicketKickoffComposer";
import { useBundledSidecarRecipeLaunch } from "~/t3work/t3work-useBundledSidecarRecipeLaunch";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

type TicketKickoffPanelProps = {
  profileId?: string;
  projectId: string;
  issueThreads: ProjectThread[];
  quickStartRecipeInput: T3workSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  injectedContextAttachments?: ReadonlyArray<T3WorkContextAttachment>;
  onOpenThread: (threadId: string) => void;
  onKickoff: (
    instruction: string,
    kickoffPending: boolean | undefined,
    selection: ModelSelection,
    runtimeMode: RuntimeMode,
    interactionMode: ProviderInteractionMode,
    selectedToolIds: ReadonlyArray<T3workThreadToolId>,
    contextAttachments: ReadonlyArray<T3WorkContextAttachment>,
    kickoffWorkflow?: T3workKickoffWorkflow,
  ) => void;
  renderComposer: (props: {
    composerRef: React.RefObject<T3workKickoffComposerHandle | null>;
    prefillText?: string;
    selectedRecipe?: T3workSelectedRecipeQuickStart;
    onClearSelectedRecipe?: () => void;
    onSubmit: (
      text: string,
      selection: ModelSelection,
      runtimeMode: RuntimeMode,
      interactionMode: ProviderInteractionMode,
      selectedToolIds: ReadonlyArray<T3workThreadToolId>,
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
    ReadonlyArray<T3WorkContextAttachment>
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
        recipe: applyT3workRecipeQuickStartLaunchCustomization(recipe, customization),
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

  const projectDefault = readProjectSidecarCompositionFromProject(quickStartRecipeInput.project);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1">
        <T3workSidecarComposition
          surface="workitem.detail.sidepanel"
          profileId={profileId}
          projectDefault={projectDefault}
          host={sidecarHost}
          resolveSectionProps={(sectionId) =>
            resolveT3workKickoffSectionProps({
              sectionId,
              recipeInput: quickStartRecipeInput,
              ...(selectedRecipe?.recipe.id ? { selectedRecipeId: selectedRecipe.recipe.id } : {}),
              recentThreads: issueThreads,
              recentEmptyMessage: "No conversations started for this ticket yet.",
              recentShowSearch: false,
              recentShowCount: false,
            })
          }
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
              ? buildT3workSelectedRecipeKickoffLaunch({
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
