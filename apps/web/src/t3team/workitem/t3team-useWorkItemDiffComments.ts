import { useCallback, useMemo, useState } from "react";

/**
 * Anchored review comments over a proposed document.
 *
 * A comment belongs to a block and quotes the exact text it was made against. The quote is the
 * anchor: ADF has no stable node identity, so there is nothing durable to point at, and a character
 * offset survives even less — the agent's next revision shifts every offset after the first edit.
 *
 * Matching on the quote degrades honestly. It still resolves after unrelated edits elsewhere in the
 * block, and when the quoted text is itself rewritten the comment stays visible but unanchored,
 * which is what a reviewer expects from quoted feedback. The alternative — fuzzy re-attachment —
 * risks silently pinning a remark to words nobody selected.
 */

export type T3TeamDiffComment = {
  readonly id: string;
  readonly blockId: string;
  readonly quote: string;
  readonly body: string;
};

export type T3TeamDiffCommentsApi = {
  readonly comments: ReadonlyArray<T3TeamDiffComment>;
  readonly total: number;
  readonly forBlock: (blockId: string) => ReadonlyArray<T3TeamDiffComment>;
  readonly quotesForBlock: (blockId: string) => ReadonlyArray<string>;
  readonly add: (input: { blockId: string; quote: string; body: string }) => void;
  readonly remove: (id: string) => void;
};

export function useWorkItemDiffComments(
  initial: ReadonlyArray<T3TeamDiffComment> = [],
): T3TeamDiffCommentsApi {
  const [comments, setComments] = useState<ReadonlyArray<T3TeamDiffComment>>(initial);

  const byBlock = useMemo(() => {
    const index = new Map<string, Array<T3TeamDiffComment>>();
    for (const comment of comments) {
      const bucket = index.get(comment.blockId);
      if (bucket) bucket.push(comment);
      else index.set(comment.blockId, [comment]);
    }
    return index;
  }, [comments]);

  const forBlock = useCallback(
    (blockId: string): ReadonlyArray<T3TeamDiffComment> => byBlock.get(blockId) ?? [],
    [byBlock],
  );

  const quotesForBlock = useCallback(
    (blockId: string): ReadonlyArray<string> => forBlock(blockId).map((comment) => comment.quote),
    [forBlock],
  );

  const add = useCallback((input: { blockId: string; quote: string; body: string }) => {
    const body = input.body.trim();
    if (body === "") return;
    setComments((current) => [
      ...current,
      {
        id: `${input.blockId}:${current.length}:${body.length}`,
        blockId: input.blockId,
        quote: input.quote,
        body,
      },
    ]);
  }, []);

  const remove = useCallback((id: string) => {
    setComments((current) => current.filter((comment) => comment.id !== id));
  }, []);

  return { comments, total: comments.length, forBlock, quotesForBlock, add, remove };
}
