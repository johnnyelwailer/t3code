import { useCallback, useMemo, useState } from "react";

import {
  addDiffComment,
  indexDiffCommentsByBlock,
  removeDiffComment,
  type T3TeamDiffComment,
  type T3TeamDiffCommentInput,
} from "~/t3team/workitem/t3team-workItemDiffCommentList";

/**
 * Anchored review comments over a proposed document, held as local review state.
 *
 * The list model itself lives in `t3team-workItemDiffCommentList` — the composer's staged rewrite
 * action needs the same one, and a comment must mean the same thing on both surfaces because both
 * end up as the `describe-rewrite` workflow's `comments` input.
 *
 * Matching on the quote degrades honestly. It still resolves after unrelated edits elsewhere in the
 * block, and when the quoted text is itself rewritten the comment stays visible but unanchored,
 * which is what a reviewer expects from quoted feedback. The alternative — fuzzy re-attachment —
 * risks silently pinning a remark to words nobody selected.
 */

export type { T3TeamDiffComment } from "~/t3team/workitem/t3team-workItemDiffCommentList";

export type T3TeamDiffCommentsApi = {
  readonly comments: ReadonlyArray<T3TeamDiffComment>;
  readonly total: number;
  readonly forBlock: (blockId: string) => ReadonlyArray<T3TeamDiffComment>;
  readonly quotesForBlock: (blockId: string) => ReadonlyArray<string>;
  readonly add: (input: T3TeamDiffCommentInput) => void;
  readonly remove: (id: string) => void;
};

export function useWorkItemDiffComments(
  initial: ReadonlyArray<T3TeamDiffComment> = [],
): T3TeamDiffCommentsApi {
  const [comments, setComments] = useState<ReadonlyArray<T3TeamDiffComment>>(initial);

  const byBlock = useMemo(() => indexDiffCommentsByBlock(comments), [comments]);

  const forBlock = useCallback(
    (blockId: string): ReadonlyArray<T3TeamDiffComment> => byBlock.get(blockId) ?? [],
    [byBlock],
  );

  const quotesForBlock = useCallback(
    (blockId: string): ReadonlyArray<string> => forBlock(blockId).map((comment) => comment.quote),
    [forBlock],
  );

  const add = useCallback((input: T3TeamDiffCommentInput) => {
    setComments((current) => addDiffComment(current, input));
  }, []);

  const remove = useCallback((id: string) => {
    setComments((current) => removeDiffComment(current, id));
  }, []);

  return { comments, total: comments.length, forBlock, quotesForBlock, add, remove };
}
