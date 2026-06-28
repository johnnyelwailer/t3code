import {
  type AddToChatPayloadInput,
  type AddToChatPayloadProgressUpdate,
  buildContextAttachment,
  compactJson,
  isDirectoryBundlePayload,
  sanitizeForFileName,
  type AddToChatRequest,
} from "~/t3work/t3work-addToChatUtils";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import { persistDirectoryBundleToWorkspace } from "~/t3work/t3work-contextDirectoryBundlePersist";
import { T3WORK_PROJECT_CONTEXT_ROOT } from "~/t3work/t3work-projectSetup";
import {
  buildInitialSyncProgressUpdate,
  buildSyncProgressAttachment,
  buildWriteProgressUpdate,
} from "~/t3work/t3work-contextAttachmentSyncProgress";

const attachmentRequestById = new Map<string, AddToChatRequest>();
const attachmentSyncPromiseById = new Map<string, Promise<T3WorkContextAttachment>>();

function buildFallbackSnapshotPath(request: AddToChatRequest): string {
  return [
    T3WORK_PROJECT_CONTEXT_ROOT,
    "misc",
    sanitizeForFileName(request.projectId),
    sanitizeForFileName(request.dedupeKey ?? request.kind ?? request.targetLabel),
    "entrypoint.json",
  ].join("/");
}

async function persistPayload(input: {
  backend?: BackendApi;
  request: AddToChatRequest;
  payload: unknown;
  onProgress?:
    | ((input: { update: AddToChatPayloadProgressUpdate; relativePath?: string }) => void)
    | undefined;
  startedAt: string;
}): Promise<string | undefined> {
  if (!input.request.projectWorkspaceRoot) {
    throw new Error("Attached context requires a managed project workspace.");
  }
  if (!input.backend) {
    throw new Error("Attached context backend is unavailable.");
  }

  if (isDirectoryBundlePayload(input.payload)) {
    const directoryBundle = input.payload;
    input.onProgress?.({
      update: buildWriteProgressUpdate({
        request: input.request,
        payload: directoryBundle,
        startedAt: input.startedAt,
        completedCount: 0,
        activeIndex: 0,
      }),
    });
    let completed = 0;
    await persistDirectoryBundleToWorkspace({
      backend: input.backend,
      workspaceRoot: input.request.projectWorkspaceRoot,
      payload: directoryBundle,
      onProgress: (progress) => {
        completed = progress.completedCount;
        input.onProgress?.({
          update: buildWriteProgressUpdate({
            request: input.request,
            payload: directoryBundle,
            startedAt: input.startedAt,
            completedCount: completed,
            ...(completed < directoryBundle.files.length
              ? { activeIndex: progress.activeIndex }
              : {}),
          }),
        });
      },
    });
    return undefined;
  }

  const relativePath = buildFallbackSnapshotPath(input.request);
  input.onProgress?.({
    update: buildWriteProgressUpdate({
      request: input.request,
      payload: input.payload,
      relativePath,
      startedAt: input.startedAt,
      completedCount: 0,
      activeIndex: 0,
    }),
    relativePath,
  });
  await input.backend.projectWorkspace.writeContextFiles({
    workspaceRoot: input.request.projectWorkspaceRoot,
    files: [{ relativePath, contents: compactJson(input.payload) }],
  });
  input.onProgress?.({
    update: buildWriteProgressUpdate({
      request: input.request,
      payload: input.payload,
      relativePath,
      startedAt: input.startedAt,
      completedCount: 1,
    }),
    relativePath,
  });
  return relativePath;
}

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
    const relativePath = await persistPayload({
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
