import type { BackendApi } from "~/t3work/backend/t3work-types";
import { buildContextAttachment } from "~/t3work/t3work-addToChatUtils";
import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import {
  resolveContextAttachmentRequest,
  syncContextAttachmentFromRequest,
} from "~/t3work/t3work-contextAttachmentSync";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";

export function appendContextAttachmentsToPrompt(
  prompt: string,
  attachments: ReadonlyArray<Pick<T3WorkContextAttachment, "contextText">>,
): string {
  const contextAttachmentPrefix = attachments
    .map((attachment) => attachment.contextText)
    .join("\n\n");
  return contextAttachmentPrefix ? `${contextAttachmentPrefix}\n\n${prompt}` : prompt;
}

export async function prepareThreadContextAttachments(input: {
  threadId: string;
  backend: BackendApi | null | undefined;
}): Promise<ReadonlyArray<T3WorkContextAttachment>> {
  const current =
    useT3WorkAddToChatStore.getState().threadAttachmentsByThreadId[input.threadId] ?? [];
  const nextAttachments: T3WorkContextAttachment[] = [];

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
      useT3WorkAddToChatStore
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
      useT3WorkAddToChatStore
        .getState()
        .replaceThreadAttachment(input.threadId, attachment.id, failedAttachment);
      throw new Error(`Failed to sync attached context "${attachment.label}": ${message}`, {
        cause: error,
      });
    }
  }

  return nextAttachments;
}
