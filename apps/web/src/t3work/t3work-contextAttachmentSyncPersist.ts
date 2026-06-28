import {
  type AddToChatPayloadProgressUpdate,
  type AddToChatRequest,
  compactJson,
  isDirectoryBundlePayload,
  sanitizeForFileName,
} from "~/t3work/t3work-addToChatUtils";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { persistDirectoryBundleToWorkspace } from "~/t3work/t3work-contextDirectoryBundlePersist";
import { T3WORK_PROJECT_CONTEXT_ROOT } from "~/t3work/t3work-projectSetup";
import { buildWriteProgressUpdate } from "~/t3work/t3work-contextAttachmentSyncProgress";
import { persistServerOwnedDirectoryBundle } from "~/t3work/t3work-contextAttachmentSyncServerOwned";

function buildFallbackSnapshotPath(request: AddToChatRequest): string {
  return [
    T3WORK_PROJECT_CONTEXT_ROOT,
    "misc",
    sanitizeForFileName(request.projectId),
    sanitizeForFileName(request.dedupeKey ?? request.kind ?? request.targetLabel),
    "entrypoint.json",
  ].join("/");
}

export async function persistContextAttachmentPayload(input: {
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
    if (directoryBundle.files.length === 0) {
      return persistServerOwnedDirectoryBundle({
        request: input.request,
        payload: directoryBundle,
        startedAt: input.startedAt,
        ...(input.onProgress ? { onProgress: input.onProgress } : {}),
      });
    }
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
