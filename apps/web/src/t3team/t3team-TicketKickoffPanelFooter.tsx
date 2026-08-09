/**
 * The kickoff panel's footer: everything the composer carries INTO a send, plus the send itself.
 *
 * Split out of `TicketKickoffPanel` because this is where all the submit-time inputs now meet — the
 * attached context, the notes staged by the Description header's `Rewrite` control, whatever action is
 * preselected, and the human's own text. Keeping the assembly in one small component means there is a
 * single place that decides what a send means.
 *
 * A staged action REPLACES the locally selected recipe for display and for launch. Both are "the
 * action this composer will run", and the composer already knows how to render exactly one of them —
 * `TicketKickoffComposerSelectedRecipe`, the existing "Selected action" card.
 *
 * Staged notes render with `T3TeamDiffCommentThread`, the same quoted-comment row the diff reviewer
 * uses, so a note looks the same wherever it was left and each one keeps its own remove control.
 */

import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import { ContextAttachmentChip } from "~/t3team/components/t3team-ContextAttachmentChip";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import type { T3TeamSelectedRecipeQuickStart } from "~/t3team/t3team-recipeQuickStartLaunch";
import { buildT3TeamComposerKickoff } from "~/t3team/t3team-stagedComposerKickoff";
import type { T3TeamStagedComposerAction } from "~/t3team/t3team-stagedComposerActionStore";
import type { T3TeamKickoffComposerHandle } from "~/t3team/t3team-TicketKickoffComposer";
import type { T3TeamKickoffWorkflow, T3TeamThreadToolId } from "~/t3team/t3team-types";
import { T3TeamDiffCommentThread } from "~/t3team/workitem/t3team-WorkItemDiffCommentUi";

export type T3TeamKickoffComposerRenderer = (props: {
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

export type T3TeamKickoffPanelKickoff = (
  instruction: string,
  kickoffPending: boolean | undefined,
  selection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  selectedToolIds: ReadonlyArray<T3TeamThreadToolId>,
  contextAttachments: ReadonlyArray<T3TeamContextAttachment>,
  kickoffWorkflow?: T3TeamKickoffWorkflow,
) => void;

export function TicketKickoffPanelFooter({
  composerRef,
  contextAttachments,
  stagedAction,
  selectedRecipe,
  onRemoveContextAttachment,
  onRemoveStagedComment,
  onClearStagedAction,
  onClearSelectedRecipe,
  onKickoff,
  onSubmitted,
  renderComposer,
}: {
  readonly composerRef: React.RefObject<T3TeamKickoffComposerHandle | null>;
  readonly contextAttachments: ReadonlyArray<T3TeamContextAttachment>;
  readonly stagedAction: T3TeamStagedComposerAction | undefined;
  readonly selectedRecipe: T3TeamSelectedRecipeQuickStart | null;
  readonly onRemoveContextAttachment: (id: string) => void;
  readonly onRemoveStagedComment: (commentId: string) => void;
  readonly onClearStagedAction: () => void;
  readonly onClearSelectedRecipe: () => void;
  readonly onKickoff: T3TeamKickoffPanelKickoff;
  readonly onSubmitted: () => void;
  readonly renderComposer: T3TeamKickoffComposerRenderer;
}) {
  const effectiveSelectedRecipe = stagedAction?.selectedRecipe ?? selectedRecipe;
  const stagedComments = stagedAction?.comments ?? [];

  return (
    <div className="shrink-0 border-t border-border bg-background/75 p-3 sm:p-4">
      {contextAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {contextAttachments.map((attachment) => (
            <ContextAttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={onRemoveContextAttachment}
            />
          ))}
        </div>
      )}
      <T3TeamDiffCommentThread
        comments={stagedComments}
        onRemove={onRemoveStagedComment}
        className="mb-2 mt-0"
      />
      {renderComposer({
        composerRef,
        ...(effectiveSelectedRecipe ? { selectedRecipe: effectiveSelectedRecipe } : {}),
        onClearSelectedRecipe: () => {
          onClearStagedAction();
          onClearSelectedRecipe();
        },
        onSubmit: (text, selection, runtimeMode, interactionMode, selectedToolIds) => {
          const kickoff = buildT3TeamComposerKickoff({
            ...(stagedAction ? { stagedAction } : {}),
            ...(selectedRecipe ? { selectedRecipe } : {}),
            composerText: text,
          });
          onKickoff(
            kickoff.kickoffMessage,
            kickoff.kickoffPending,
            selection,
            runtimeMode,
            interactionMode,
            selectedToolIds,
            contextAttachments,
            kickoff.workflow,
          );
          // One-way: the send consumes the preselected action, so a second click cannot launch the
          // same rewrite twice (the latch the control itself used to hold).
          onClearStagedAction();
          onSubmitted();
        },
      })}
    </div>
  );
}
