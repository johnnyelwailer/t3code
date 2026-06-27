import { MessageId } from "@t3tools/contracts";

import type { ChatMessage } from "~/types";
import { isWaitingForKickoffInput } from "~/t3work/chat/t3work-threadKickoffPlaceholder";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

export function buildThreadKickoffHistoryMessage(input: {
  threadId: string;
  createdAt: string;
  kickoffMessage: string | undefined;
  kickoffPending: boolean | undefined;
  kickoffWorkflow: T3workKickoffWorkflow | undefined;
}): ChatMessage | undefined {
  const trimmedMessage = input.kickoffMessage?.trim();
  if (!trimmedMessage) {
    return undefined;
  }

  if (!isWaitingForKickoffInput(input.kickoffWorkflow, input.kickoffPending)) {
    return undefined;
  }

  return {
    id: MessageId.make(`t3work-system-kickoff:${input.threadId}`),
    role: "system",
    text: trimmedMessage,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    turnId: null,
    streaming: false,
  };
}
