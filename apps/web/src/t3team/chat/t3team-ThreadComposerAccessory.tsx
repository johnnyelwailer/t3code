/**
 * Everything a thread composer carries INTO a send, rendered directly above the input.
 *
 * Fills ChatView's `composerContextAttachmentSlot`, so the embedded thread aside shows the same
 * attached context, the same "Selected action" card, and the same removable note rows as the kickoff
 * composer — the two composers must not develop separate vocabularies for the same three things.
 *
 * Self-gating throughout (`null` when there is nothing to show), which is why the caller can hand it
 * over unconditionally instead of re-deriving what is staged.
 */

import { ContextAttachmentStrip } from "~/t3team/components/t3team-ContextAttachmentChip";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import { TicketKickoffComposerSelectedRecipe } from "~/t3team/t3team-TicketKickoffComposerSelectedRecipe";
import {
  useT3TeamStagedComposerAction,
  useT3TeamStagedComposerActionStore,
} from "~/t3team/t3team-stagedComposerActionStore";
import { T3TeamDiffCommentThread } from "~/t3team/workitem/t3team-WorkItemDiffCommentUi";

export function T3TeamThreadComposerAccessory({
  projectId,
  ticketId,
  attachments,
  onRemoveAttachment,
}: {
  readonly projectId: string;
  /** Absent on threads that do not belong to a work item — nothing can be staged for those. */
  readonly ticketId?: string | undefined;
  readonly attachments: ReadonlyArray<T3TeamContextAttachment>;
  readonly onRemoveAttachment: (attachmentId: string) => void;
}) {
  const target = ticketId ? { projectId, ticketId } : undefined;
  const staged = useT3TeamStagedComposerAction(target);
  const removeComment = useT3TeamStagedComposerActionStore((state) => state.removeComment);
  const clear = useT3TeamStagedComposerActionStore((state) => state.clear);

  return (
    <>
      <ContextAttachmentStrip attachments={attachments} onRemove={onRemoveAttachment} />
      {staged && target ? (
        <div className="mx-auto w-full max-w-3xl">
          <TicketKickoffComposerSelectedRecipe
            selectedRecipe={staged.selectedRecipe}
            onClearSelectedRecipe={() => clear(target)}
          />
          <T3TeamDiffCommentThread
            comments={staged.comments}
            onRemove={(commentId) => removeComment(target, commentId)}
            className="mt-0 px-3 pb-1 sm:px-4"
          />
        </div>
      ) : null}
    </>
  );
}
