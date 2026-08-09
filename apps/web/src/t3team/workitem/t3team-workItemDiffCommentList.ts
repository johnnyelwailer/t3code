/**
 * The comment list shared by every "leave feedback on this prose" surface.
 *
 * A comment belongs to a block and quotes the exact text it was made against. The quote is the
 * anchor: ADF has no stable node identity, so there is nothing durable to point at, and a character
 * offset survives even less — the agent's next revision shifts every offset after the first edit.
 *
 * The list operations live here rather than inside `useWorkItemDiffComments` because two owners now
 * need them: that hook (local review state over a proposed diff) and the composer's staged rewrite
 * action, which has to survive the component that created it. One implementation means the two can
 * never disagree about what a comment is — which matters, because both feed the SAME
 * `describe-rewrite` workflow input.
 */

export type T3TeamDiffComment = {
  readonly id: string;
  readonly blockId: string;
  readonly quote: string;
  readonly body: string;
};

export type T3TeamDiffCommentInput = {
  readonly blockId: string;
  readonly quote: string;
  readonly body: string;
};

/**
 * The anchor for feedback that was NOT made against a selected passage — the description-header
 * "Rewrite" control, where the human is talking about the field as a whole.
 *
 * The quote is empty, which is the honest representation: nothing was selected. The workflow body
 * omits its `On "<quote>": ` prefix for an unquoted note rather than making one up, so this stays a
 * single comment shape across both surfaces instead of inventing a label the user never wrote.
 */
export const T3TEAM_WHOLE_DESCRIPTION_BLOCK_ID = "description";
export const T3TEAM_WHOLE_DESCRIPTION_QUOTE = "";

/**
 * Ids are opaque and monotonic. Deriving them from the list length (as this did while it lived in
 * the hook) collides once a comment is removed and a similar one added back, which is exactly the
 * edit sequence a chip strip invites — and a duplicate React key silently drops a chip.
 */
let commentSequence = 0;

export function nextDiffCommentId(blockId: string): string {
  commentSequence += 1;
  return `${blockId}:${commentSequence}`;
}

/** Blank bodies are dropped: a comment with nothing in it is not feedback. */
export function addDiffComment(
  list: ReadonlyArray<T3TeamDiffComment>,
  input: T3TeamDiffCommentInput,
): ReadonlyArray<T3TeamDiffComment> {
  const body = input.body.trim();
  if (body === "") return list;
  return [
    ...list,
    { id: nextDiffCommentId(input.blockId), blockId: input.blockId, quote: input.quote, body },
  ];
}

export function removeDiffComment(
  list: ReadonlyArray<T3TeamDiffComment>,
  id: string,
): ReadonlyArray<T3TeamDiffComment> {
  return list.filter((comment) => comment.id !== id);
}

export function indexDiffCommentsByBlock(
  list: ReadonlyArray<T3TeamDiffComment>,
): ReadonlyMap<string, ReadonlyArray<T3TeamDiffComment>> {
  const index = new Map<string, Array<T3TeamDiffComment>>();
  for (const comment of list) {
    const bucket = index.get(comment.blockId);
    if (bucket) bucket.push(comment);
    else index.set(comment.blockId, [comment]);
  }
  return index;
}

/** The shape the `describe-rewrite` workflow's `comments` input expects — no ids, they are local. */
export function toWorkflowCommentInputs(
  list: ReadonlyArray<T3TeamDiffComment>,
): ReadonlyArray<T3TeamDiffCommentInput> {
  return list.map((comment) => ({
    blockId: comment.blockId,
    quote: comment.quote,
    body: comment.body,
  }));
}
