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

import { cn } from "~/t3team/lib/t3team-utils";
import type { T3TeamDiffComment } from "~/t3team/workitem/t3team-workItemDiffCommentList";
import {
  DIFF_BLOCK_ATTRIBUTE,
  T3TeamDiffCommentThread,
} from "~/t3team/workitem/t3team-WorkItemDiffCommentUi";
import { T3TeamDiffGutter, T3TeamDiffText } from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";
import type { DraftDiffParagraph } from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";
import {
  flattenDiffSegmentKinds,
  isWholeBlockChange,
} from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";
import { applyCommentQuotes } from "~/t3team/workitem/t3team-workItemDiffModel";

export function WorkItemDescriptionDiffBlock({
  paragraph,
  comments,
  quotes,
  onRemoveComment,
}: {
  readonly paragraph: DraftDiffParagraph;
  readonly comments: ReadonlyArray<T3TeamDiffComment>;
  readonly quotes: ReadonlyArray<string>;
  readonly onRemoveComment: (id: string) => void;
}) {
  const wholeBlock = isWholeBlockChange(paragraph.state);
  const quoted = applyCommentQuotes(paragraph.segments, quotes);

  return (
    <div className="group flex">
      <T3TeamDiffGutter
        {...(paragraph.state ? { state: paragraph.state } : {})}
        commentCount={comments.length}
      />
      <div className="min-w-0 flex-1" {...{ [DIFF_BLOCK_ATTRIBUTE]: paragraph.id }}>
        <p
          className={cn(
            // A list block keeps one item per line, so the newlines between them must survive: a plain
            // <p> collapses them and "- RE - PO / PPO - Dev" runs together on one line.
            "whitespace-pre-line",
            wholeBlock && "border-l-2 pl-3",
            wholeBlock && paragraph.state === "add" && "border-success",
            wholeBlock &&
              paragraph.state === "del" &&
              "border-destructive text-muted-foreground line-through",
          )}
        >
          <T3TeamDiffText segments={wholeBlock ? flattenDiffSegmentKinds(quoted) : quoted} />
        </p>
        <T3TeamDiffCommentThread comments={comments} onRemove={onRemoveComment} />
      </div>
    </div>
  );
}
