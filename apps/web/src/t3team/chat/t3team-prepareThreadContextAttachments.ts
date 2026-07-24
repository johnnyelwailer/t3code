import type { BackendApi } from "~/t3team/backend/t3team-types";
import { buildContextAttachment } from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import {
  resolveContextAttachmentRequest,
  syncContextAttachmentFromRequest,
} from "~/t3team/t3team-contextAttachmentSync";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";

export function appendContextAttachmentsToPrompt(
  prompt: string,
  attachments: ReadonlyArray<Pick<T3TeamContextAttachment, "contextText">>,
): string {
  const contextAttachmentPrefix = attachments
    .map((attachment) => attachment.contextText)
    .join("\n\n");
  return contextAttachmentPrefix ? `${contextAttachmentPrefix}\n\n${prompt}` : prompt;
}

export async function prepareThreadContextAttachments(input: {
  threadId: string;
  backend: BackendApi | null | undefined;
}): Promise<ReadonlyArray<T3TeamContextAttachment>> {
  const current =
    useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId[input.threadId] ?? [];
  const nextAttachments: T3TeamContextAttachment[] = [];

  for (const attachment of current) {
    const request = resolveContextAttachmentRequest(attachment.id);
    if (!request) {
      nextAttachments.push(attachment);
      continue;
    }

    try {
      const nextAttachment = await syncContextAttachmentFromRequest({
        attachmentId: attachment.id,
        request,
        ...(input.backend ? { backend: input.backend } : {}),
        forceRefresh: true,
      });
      useT3TeamAddToChatStore
        .getState()
        .replaceThreadAttachment(input.threadId, attachment.id, nextAttachment);
      nextAttachments.push(nextAttachment);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync attached context.";
      const failedAttachment = buildContextAttachment({
        id: attachment.id,
        request,
        syncStatus: "error",
        syncError: message,
      });
      useT3TeamAddToChatStore
        .getState()
        .replaceThreadAttachment(input.threadId, attachment.id, failedAttachment);
      throw new Error(`Failed to sync attached context "${attachment.label}": ${message}`, {
        cause: error,
      });
    }
  }

  return nextAttachments;
}
