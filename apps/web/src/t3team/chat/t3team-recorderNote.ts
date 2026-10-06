/**
 * Fork run-less system notes on the V2 timeline.
 *
 * The server's run-less recorder (`T3TeamThreadMessageRecorder`) writes a `system`-role note
 * (workflow notification, decision card, plan card, retry note) as a V2 `system_notice` turn item
 * with the id `t3team:turn-item:<messageId>`. Upstream renders a system notice as a runtime
 * warning line; a fork note is a conversation row instead, so it becomes a `system` message entry
 * keyed by its message id — the id its `message-ext` artifact and context ext are keyed by
 * (see `t3team-timelineArtifacts.ts`).
 */
import { MessageId, type OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { TimelineEntry } from "~/session-logic";

/** Mirrors the server's `recorderTurnItemId` (`t3team-threadMessagePayloads.ts`). */
const RECORDER_TURN_ITEM_PREFIX = "t3team:turn-item:";

/** The message id of a recorder note's turn item, or null for any other item. */
export function t3teamRecorderNoteMessageId(item: {
  readonly id: string;
  readonly type: string;
}): MessageId | null {
  if (item.type !== "system_notice" || !item.id.startsWith(RECORDER_TURN_ITEM_PREFIX)) return null;
  const messageId = item.id.slice(RECORDER_TURN_ITEM_PREFIX.length);
  return messageId.length > 0 ? MessageId.make(messageId) : null;
}

/** The timeline entry of a fork recorder note, or null when the row is not one. */
export function t3teamRecorderNoteEntry(
  row: OrchestrationV2ProjectedTurnItem,
  createdAt: string,
): TimelineEntry | null {
  const { item } = row;
  if (item.type !== "system_notice") return null;
  const messageId = t3teamRecorderNoteMessageId(item);
  if (messageId === null) return null;
  return {
    id: messageId,
    kind: "message",
    createdAt,
    projectedItem: row,
    message: {
      id: messageId,
      role: "system",
      text: item.message,
      runId: null,
      streaming: false,
      createdBy: "system",
      createdAt,
      updatedAt: DateTime.formatIso(item.updatedAt),
    },
  };
}
