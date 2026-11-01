import { useAtomValue } from "@effect/atom-react";
import { readT3TeamMessageExt } from "@t3tools/client-runtime/state/message-framing";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  buildRichChoiceFeedEntries,
  type T3TeamRichChoiceFeedEntry,
  type T3TeamRichChoiceThreadMessage,
} from "../lib/t3team-richChoiceFeed";
import { useT3TeamThreadArtifacts } from "./t3team-threadArtifacts";
import { environmentThreadDetails } from "./threads";

const NO_ENTRIES: ReadonlyArray<T3TeamRichChoiceFeedEntry> = [];

/**
 * The thread's rich-choice rows: cards from the fork thread artifacts, their open / answered /
 * superseded state from the thread's user messages (the hidden widget replies included, which the
 * feed itself drops). No rich-choice artifact means no rows and no work beyond one list scan.
 */
export function useT3TeamRichChoiceFeedEntries(
  environmentId: EnvironmentId,
  threadId: ThreadId,
): ReadonlyArray<T3TeamRichChoiceFeedEntry> {
  const artifacts = useT3TeamThreadArtifacts(environmentId, threadId);
  const hasWidget = artifacts.some((artifact) => artifact.kind === "widget");
  const turnItems = useAtomValue(
    environmentThreadDetails.visibleTurnItemsAtom({ environmentId, threadId }),
  );
  if (!hasWidget) return NO_ENTRIES;
  const messages: T3TeamRichChoiceThreadMessage[] = [];
  for (const { item } of turnItems) {
    if (item.type !== "user_message") continue;
    messages.push({
      text: item.text,
      createdAt: DateTime.formatIso(item.startedAt ?? item.updatedAt),
      widgetReplyId: readT3TeamMessageExt(item.context)?.widgetReply?.widgetId,
    });
  }
  return buildRichChoiceFeedEntries({ artifacts, messages });
}
