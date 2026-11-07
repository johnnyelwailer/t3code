import { useAtomValue } from "@effect/atom-react";
import { readT3TeamMessageExt } from "@t3tools/client-runtime/state/message-framing";
import type { EnvironmentId, OrchestrationMessageContext, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { useMemo } from "react";

import {
  buildRichChoiceFeedEntries,
  type T3TeamRichChoiceFeedEntry,
  type T3TeamRichChoiceThreadMessage,
} from "../lib/t3team-richChoiceFeed";
import { useT3TeamThreadArtifacts } from "./t3team-threadArtifacts";
import { environmentThreadDetails } from "./threads";

const NO_ENTRIES: ReadonlyArray<T3TeamRichChoiceFeedEntry> = [];

/** A message that is not on the server yet: a queued outbox message or a feed row still pending. */
interface PendingLike {
  readonly text: string;
  readonly context?: OrchestrationMessageContext | undefined;
}

function widgetReplies(messages: ReadonlyArray<PendingLike>) {
  return messages.flatMap((message) => {
    const widgetReplyId = readT3TeamMessageExt(message.context)?.widgetReply?.widgetId;
    return widgetReplyId === undefined ? [] : [{ text: message.text, widgetReplyId }];
  });
}

/**
 * The thread's rich-choice rows: cards from the thread artifacts; state from the loaded user
 * messages, picks in the outbox (`queuedMessages`) and acknowledged ones (their `feed` rows).
 * `historyComplete` is false while earlier history is unloaded.
 */
export function useT3TeamRichChoiceFeedEntries(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly queuedMessages: ReadonlyArray<PendingLike>;
  readonly feed: ReadonlyArray<{ readonly type: string; readonly message?: PendingLike }>;
  readonly historyComplete: boolean;
}): ReadonlyArray<T3TeamRichChoiceFeedEntry> {
  const { environmentId, threadId, queuedMessages, feed, historyComplete } = input;
  const artifacts = useT3TeamThreadArtifacts(environmentId, threadId);
  const turnItems = useAtomValue(
    environmentThreadDetails.visibleTurnItemsAtom({ environmentId, threadId }),
  );
  const hasWidget = artifacts.some((artifact) => artifact.kind === "widget");
  return useMemo(() => {
    if (!hasWidget) return NO_ENTRIES;
    const messages: T3TeamRichChoiceThreadMessage[] = [];
    let windowStart: string | null = null;
    for (const { item } of turnItems) {
      const at = DateTime.formatIso(item.startedAt ?? item.updatedAt);
      if (windowStart === null || at < windowStart) windowStart = at;
      if (item.type !== "user_message") continue;
      messages.push({
        text: item.text,
        createdAt: at,
        widgetReplyId: readT3TeamMessageExt(item.context)?.widgetReply?.widgetId,
      });
    }
    return buildRichChoiceFeedEntries({
      artifacts,
      messages,
      pendingReplies: widgetReplies([
        ...queuedMessages,
        ...feed.flatMap((row) => (row.type === "message" && row.message ? [row.message] : [])),
      ]),
      windowStart,
      historyComplete,
    });
  }, [hasWidget, artifacts, turnItems, queuedMessages, feed, historyComplete]);
}
