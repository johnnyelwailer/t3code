import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import type { ProjectThread, T3workThreadToolId } from "~/t3work/t3work-types";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import { mergeContextAttachmentsById } from "~/t3work/t3work-contextAttachmentMerge";
import { ContextAttachmentChip } from "~/t3work/components/t3work-ContextAttachmentChip";
import { T3workRecentConversations } from "~/t3work/t3work-ProjectDashboardRecentConversations";
import { T3workKickoffRecipeList } from "~/t3work/t3work-KickoffRecipeList";
import {
  applyT3workRecipeQuickStartLaunchCustomization,
  areT3workRecipeQuickStartLaunchCustomizationsEqual,
  buildT3workSelectedRecipeKickoffLaunch,
  type T3workSelectedRecipeQuickStart,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import { type T3workKickoffComposerHandle } from "~/t3work/t3work-TicketKickoffComposer";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

type TicketKickoffPanelProps = {
  displayId: string;
  issueThreads: ProjectThread[];
  quickStartRecipes: ReadonlyArray<T3workSidecarRecipeQuickStart>;
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
  displayId,
  issueThreads,
  quickStartRecipes,
  injectedContextAttachments,
  onOpenThread,
  onKickoff,
  renderComposer,
}: TicketKickoffPanelProps) {
  const [localContextAttachments, setLocalContextAttachments] = useState<
    ReadonlyArray<T3WorkContextAttachment>
  >([]);
  const composerRef = useRef<T3workKickoffComposerHandle | null>(null);
  const [dismissedAttachmentIds, setDismissedAttachmentIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedRecipe, setSelectedRecipe] = useState<T3workSelectedRecipeQuickStart | null>(null);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h3 className="text-base font-semibold">Get Help With {displayId}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Start a new conversation with all ticket context included automatically.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4 sm:p-5">
          <section className="space-y-3">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Quick starts
            </h4>
            <T3workKickoffRecipeList
              recipes={quickStartRecipes}
              {...(selectedRecipe?.recipe.id ? { selectedRecipeId: selectedRecipe.recipe.id } : {})}
              onSelectRecipe={(recipe, customization) => {
                setSelectedRecipe((current) => {
                  if (
                    current?.recipe.id === recipe.id &&
                    areT3workRecipeQuickStartLaunchCustomizationsEqual(
                      current.customization,
                      customization,
                    )
                  ) {
                    return current;
                  }

                  return {
                    recipe: applyT3workRecipeQuickStartLaunchCustomization(recipe, customization),
                    ...(customization ? { customization } : {}),
                  };
                });
              }}
            />
          </section>

          <T3workRecentConversations
            threads={issueThreads}
            onOpenThread={onOpenThread}
            title="Conversations"
            emptyMessage="No conversations started for this ticket yet."
            showSearch={false}
            showCount={false}
          />
        </div>
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
          onClearSelectedRecipe: () => setSelectedRecipe(null),
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
            setLocalContextAttachments([]);
            setDismissedAttachmentIds(new Set());
            setSelectedRecipe(null);
          },
        })}
      </div>
    </div>
  );
}
