import type {
  EnvironmentId,
  OrchestrationMessageContext,
  OrchestrationV2ConversationMessage,
  ThreadId,
} from "@t3tools/contracts";
import { useMemo } from "react";

import type { TimelineEntry } from "~/session-logic";
import { useT3TeamThreadArtifacts } from "~/state/t3team-threadSideStreams";
import {
  decorateT3TeamTimelineEntries,
  t3teamThreadActivitiesOf,
} from "~/t3team/chat/t3team-timelineArtifacts";

/**
 * A server thread's timeline with its fork artifacts joined in (rich system rows, widgets,
 * message ext), plus the thread's fork activity records (workflow step progress). A draft
 * (`threadId: null`) subscribes to nothing and passes its entries through.
 */
export function useT3TeamTimelineArtifacts(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly entries: ReadonlyArray<TimelineEntry>;
  readonly messages: ReadonlyArray<OrchestrationV2ConversationMessage> | undefined;
}) {
  const { entries, messages } = input;
  const artifacts = useT3TeamThreadArtifacts(input.environmentId, input.threadId);
  const contextByMessageId = useMemo(() => {
    const contexts = new Map<string, OrchestrationMessageContext>();
    for (const message of messages ?? []) {
      if (message.role === "system" && message.context !== undefined) {
        contexts.set(message.id, message.context);
      }
    }
    return contexts;
  }, [messages]);
  const decoratedEntries = useMemo(
    () => decorateT3TeamTimelineEntries({ entries, artifacts, contextByMessageId }),
    [artifacts, contextByMessageId, entries],
  );
  const threadActivities = useMemo(() => t3teamThreadActivitiesOf(artifacts), [artifacts]);
  return { entries: decoratedEntries, threadActivities };
}
