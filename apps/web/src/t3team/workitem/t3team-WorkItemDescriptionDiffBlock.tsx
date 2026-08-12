/**
 * One block of a proposed-description diff.
 *
 * Two ways to draw a block, and the choice is not cosmetic:
 *
 * - **Entirely added or removed** — render the prose normally behind a left border in the semantic
 *   colour. Word-level marking exists to show WHICH words changed; when every token changed it points at
 *   nothing and costs legibility. The live DOM showed a fully-new paragraph as ~20 separate padded,
 *   rounded, filled chips — with the spaces between words marked too — which is harder to read than the
 *   text it was meant to be showing.
 * - **Mixed** — mark the changed words, because that is the one case the marks earn their keep.
 *
 * The comment block attribute stays on the same element in both cases, so selecting text inside a
 * border-rendered block still resolves to an anchored comment. That is how feedback gets attached, and it
 * must not depend on how the block happens to be drawn.
 */

import { MessageSquarePlus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { cn } from "~/t3team/lib/t3team-utils";
import type { T3TeamDiffComment } from "~/t3team/workitem/t3team-workItemDiffCommentList";
import {
  DIFF_BLOCK_ATTRIBUTE,
  T3TeamDiffCommentThread,
} from "~/t3team/workitem/t3team-WorkItemDiffCommentUi";
import { T3TeamDiffGutter, T3TeamDiffText } from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";
import { T3TeamCommentPopoutCard } from "~/t3team/workitem/t3team-CommentPopoutCard";
import type { DraftDiffParagraph } from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";
import {
  draftDiffParagraphText,
  flattenDiffSegmentKinds,
  isWholeBlockChange,
} from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";
import { applyCommentQuotes } from "~/t3team/workitem/t3team-workItemDiffModel";

export function WorkItemDescriptionDiffBlock({
  paragraph,
  comments,
  quotes,
  onRemoveComment,
  removed,
  onComment,
  onRemoveParagraph,
  onRestoreParagraph,
}: {
  readonly paragraph: DraftDiffParagraph;
  readonly comments: ReadonlyArray<T3TeamDiffComment>;
  readonly quotes: ReadonlyArray<string>;
  readonly onRemoveComment: (id: string) => void;
  readonly removed: boolean;
  readonly onComment: (input: { blockId: string; quote: string; body: string }) => void;
  readonly onRemoveParagraph: () => void;
  readonly onRestoreParagraph: () => void;
}) {
  const [commenting, setCommenting] = useState(false);
  const wholeBlock = isWholeBlockChange(paragraph.state);
  const quoted = applyCommentQuotes(paragraph.segments, quotes);
  const paragraphText = draftDiffParagraphText(paragraph).trim();

  return (
    <div className="group flex">
      <T3TeamDiffGutter
        {...(paragraph.state ? { state: paragraph.state } : {})}
        commentCount={comments.length}
      />
      <div className="min-w-0 flex-1" {...{ [DIFF_BLOCK_ATTRIBUTE]: paragraph.id }}>
        {removed ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-muted-foreground">
            <span>Paragraph removed from this draft.</span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onRestoreParagraph}
              aria-label="Restore removed paragraph"
            >
              <RotateCcw className="size-3.5" />
              Undo
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <p
                className={cn(
                  // A list block keeps one item per line, so the newlines between them must survive: a plain
                  // <p> collapses them and "- RE - PO / PPO - Dev" runs together on one line.
                  "min-w-0 flex-1 whitespace-pre-line",
                  wholeBlock && "border-l-2 pl-3",
                  wholeBlock && paragraph.state === "add" && "border-success",
                  wholeBlock &&
                    paragraph.state === "del" &&
                    "border-destructive text-muted-foreground line-through",
                )}
              >
                <T3TeamDiffText segments={wholeBlock ? flattenDiffSegmentKinds(quoted) : quoted} />
              </p>
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Comment on this paragraph"
                  title="Comment on this paragraph"
                  onClick={() => setCommenting(true)}
                >
                  <MessageSquarePlus className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Remove this paragraph from the draft"
                  title="Remove this paragraph from the draft"
                  onClick={onRemoveParagraph}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </span>
            </div>
            {commenting ? (
              <div className="mt-2 max-w-md">
                <T3TeamCommentPopoutCard
                  quote={paragraphText}
                  ariaLabel="Comment on this paragraph"
                  onCancel={() => setCommenting(false)}
                  onSubmit={(body) => {
                    onComment({ blockId: paragraph.id, quote: paragraphText, body });
                    setCommenting(false);
                  }}
                />
              </div>
            ) : null}
            <T3TeamDiffCommentThread comments={comments} onRemove={onRemoveComment} />
          </>
        )}
      </div>
    </div>
  );
}
