/**
 * Inter-agent digest FRAMING: the text of the ONE run a claimed mailbox
 * batch is delivered as (t3team-actorMailboxDelivery.ts). Sender, subject and
 * urgency per message; short bodies inlined, long bodies as subject plus a
 * `t3_read_message` pointer; bursts folded (GHE #157).
 *
 * @module t3team-actorReactionFraming
 */
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailboxEntry.ts";
import { summarizeActorMessageForDelivery } from "./t3team-actorReactionInputSummarize.ts";
import { renderAutomatedBurstBlock, splitAutomatedBurst } from "./t3team-actorBurstFold.ts";

/**
 * The digest for a CLAIMED BATCH: one run per batch instead of one per
 * message. When a batch carries more than the fold threshold of non-urgent
 * entries, those are rendered as ONE compact list (one line each + a
 * `t3_read_message` pointer); urgent entries keep their own full block.
 */
export const buildActorReactionDigestInput = (
  entries: ReadonlyArray<T3TeamActorMailboxEntry>,
): string => {
  const fullBlock = (entry: T3TeamActorMailboxEntry): string[] => [
    `[from «${entry.fromTitle}» · thread ${entry.fromThreadId} · id ${entry.messageId} · ` +
      `urgency ${entry.urgency}]`,
    "",
    summarizeActorMessageForDelivery(entry.text, entry.messageId, entry.summary),
    "",
  ];
  const header = `[Inter-agent digest: ${entries.length} message(s)]`;
  const { urgent, foldable, isBurst } = splitAutomatedBurst(entries);
  if (!isBurst) return [header, "", ...entries.flatMap(fullBlock)].join("\n");
  const parts: string[] = [header, ""];
  if (urgent.length > 0) parts.push(...urgent.flatMap(fullBlock));
  if (foldable.length > 0) parts.push(renderAutomatedBurstBlock(foldable));
  parts.push("");
  return parts.join("\n");
};
