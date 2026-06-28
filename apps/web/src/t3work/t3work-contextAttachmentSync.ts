import {
  type AddToChatPayloadInput,
  type AddToChatPayloadProgressUpdate,
  buildContextAttachment,
  type AddToChatRequest,
} from "~/t3work/t3work-addToChatUtils";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import {
  buildInitialSyncProgressUpdate,
  buildSyncProgressAttachment,
} from "~/t3work/t3work-contextAttachmentSyncProgress";
import { persistContextAttachmentPayload } from "~/t3work/t3work-contextAttachmentSyncPersist";

const attachmentRequestById = new Map<string, AddToChatRequest>();
const attachmentSyncPromiseById = new Map<string, Promise<T3WorkContextAttachment>>();

export function registerContextAttachmentRequest(id: string, request: AddToChatRequest): void {
  attachmentRequestById.set(id, request);
}

export function resolveContextAttachmentRequest(id: string): AddToChatRequest | undefined {
  return attachmentRequestById.get(id);
}

export function forgetContextAttachmentRequest(id: string): void {
  attachmentRequestById.delete(id);
  attachmentSyncPromiseById.delete(id);
}

export async function syncContextAttachmentFromRequest(input: {
  attachmentId: string;
  request: AddToChatRequest;
  backend?: BackendApi;
  forceRefresh?: boolean;
  onUpdate?: ((attachment: T3WorkContextAttachment) => void) | undefined;
}): Promise<T3WorkContextAttachment> {
  if (!input.forceRefresh) {
    const existing = attachmentSyncPromiseById.get(input.attachmentId);
    if (existing) {
      return existing;
    }
  }

  const promise = (async () => {
    const startedAt = new Date().toISOString();
    const emitProgress = (
      update: AddToChatPayloadProgressUpdate,
      options?: { payload?: unknown; relativePath?: string },
    ) => {
      input.onUpdate?.(
        buildSyncProgressAttachment({
          attachmentId: input.attachmentId,
          request: input.request,
          update,
          ...(options?.payload !== undefined ? { payload: options.payload } : {}),
          ...(options?.relativePath ? { relativePath: options.relativePath } : {}),
          startedAt,
        }),
      );
    };

    emitProgress(buildInitialSyncProgressUpdate({ request: input.request, startedAt }));

    const payload =
      typeof input.request.payload === "function"
        ? await input.request.payload({
            reportProgress: (update: AddToChatPayloadProgressUpdate) => emitProgress(update),
          } satisfies AddToChatPayloadInput)
        : input.request.payload;
    const relativePath = await persistContextAttachmentPayload({
      ...(input.backend ? { backend: input.backend } : {}),
      request: input.request,
      payload,
      ...(input.onUpdate
        ? {
            onProgress: (progress) =>
              emitProgress(progress.update, {
                payload,
                ...(progress.relativePath ? { relativePath: progress.relativePath } : {}),
              }),
          }
        : {}),
      startedAt,
    });
    const attachment = buildContextAttachment({
      id: input.attachmentId,
      request: input.request,
      relativePath,
      payload,
      syncStatus: "synced",
      syncedAt: new Date().toISOString(),
    });
    input.onUpdate?.(attachment);
    return attachment;
  })().finally(() => {
    if (attachmentSyncPromiseById.get(input.attachmentId) === promise) {
      attachmentSyncPromiseById.delete(input.attachmentId);
    }
  });

  attachmentSyncPromiseById.set(input.attachmentId, promise);
  return promise;
}
