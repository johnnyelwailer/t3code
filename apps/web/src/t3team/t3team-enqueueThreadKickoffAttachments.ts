import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";

export function enqueueThreadKickoffAttachments(
  threadId: string,
  attachments: ReadonlyArray<T3TeamContextAttachment>,
): void {
  const addToChatStore = useT3TeamAddToChatStore.getState();
  for (const attachment of attachments) {
    addToChatStore.enqueueThreadAttachment(threadId, attachment);
  }
}
