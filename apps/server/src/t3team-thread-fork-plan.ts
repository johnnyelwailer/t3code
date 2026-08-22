/**
 * Fork transcript planning: decide which of the parent thread's messages a fork
 * actually receives, so the forked thread stays inside a small, fixed context
 * budget regardless of how long the parent conversation was.
 *
 * Deliberately pure and model-agnostic: no tokenization, no provider calls.
 * The estimate is the standard chars/4 heuristic plus a flat allowance per
 * attachment, which is good enough to keep a fork far below any realistic
 * context window without a summarizer pass.
 */

export const FORK_TRANSCRIPT_TOKEN_CAP = 30_000;
export const FORK_TRANSCRIPT_HEAD_RATIO = 0.4;
export const FORK_ATTACHMENT_TOKEN_ALLOWANCE = 512;

export function estimateMessageTokens(message: {
  readonly text?: string | null;
  readonly attachments?: readonly unknown[] | null | undefined;
}): number {
  const textTokens = Math.ceil((message.text?.length ?? 0) / 4);
  const attachmentTokens = (message.attachments?.length ?? 0) * FORK_ATTACHMENT_TOKEN_ALLOWANCE;
  return textTokens + attachmentTokens;
}

export interface ForkTranscriptPlan {
  readonly head: readonly string[];
  readonly tail: readonly string[];
  readonly omittedCount: number;
  readonly truncated: boolean;
}

/**
 * Split an ordered message id list into a head + tail that together stay under
 * `capTokens`. The tail (recent context) gets the larger share. When the whole
 * list fits, nothing is omitted. The split guarantees at least one tail message
 * even when a single trailing message alone exceeds its budget — recent
 * context is worth keeping even at the cost of a slightly over-budget fork.
 */
export function planForkTranscript(
  messageIds: readonly string[],
  tokensByMessageId: ReadonlyMap<string, number>,
  capTokens: number = FORK_TRANSCRIPT_TOKEN_CAP,
  headRatio: number = FORK_TRANSCRIPT_HEAD_RATIO,
): ForkTranscriptPlan {
  const totalTokens = messageIds.reduce((sum, id) => sum + (tokensByMessageId.get(id) ?? 0), 0);
  if (totalTokens <= capTokens || messageIds.length <= 1) {
    return { head: [...messageIds], tail: [], omittedCount: 0, truncated: false };
  }

  const headBudget = Math.floor(capTokens * headRatio);
  const tailBudget = capTokens - headBudget;

  const head: string[] = [];
  let headTokens = 0;
  for (const id of messageIds) {
    const tokens = tokensByMessageId.get(id) ?? 0;
    if (head.length > 0 && headTokens + tokens > headBudget) break;
    head.push(id);
    headTokens += tokens;
  }

  const tail: string[] = [];
  let tailTokens = 0;
  for (let i = messageIds.length - 1; i >= 0; i--) {
    const id = messageIds[i]!;
    if (head.includes(id)) continue;
    const tokens = tokensByMessageId.get(id) ?? 0;
    // Always keep the most recent message, even over budget.
    if (tail.length > 0 && tailTokens + tokens > tailBudget) break;
    tail.unshift(id);
    tailTokens += tokens;
  }

  const kept = new Set([...head, ...tail]);
  const omittedCount = messageIds.filter((id) => !kept.has(id)).length;
  return { head, tail, omittedCount, truncated: omittedCount > 0 };
}
