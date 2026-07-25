import { MessageId } from "@t3tools/contracts";

import type { ChatMessage } from "~/types";
import { isWaitingForKickoffInput } from "~/t3team/chat/t3team-threadKickoffPlaceholder";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

export function buildThreadKickoffHistoryMessage(input: {
  threadId: string;
  createdAt: string;
  kickoffMessage: string | undefined;
  kickoffPending: boolean | undefined;
  kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
}): ChatMessage | undefined {
  const trimmedMessage = input.kickoffMessage?.trim();
  if (!trimmedMessage) {
    return undefined;
  }

  if (!isWaitingForKickoffInput(input.kickoffWorkflow, input.kickoffPending)) {
    return undefined;
  }

  return {
    id: MessageId.make(`t3team-system-kickoff:${input.threadId}`),
    role: "system",
    text: trimmedMessage,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    turnId: null,
    streaming: false,
  };
}
