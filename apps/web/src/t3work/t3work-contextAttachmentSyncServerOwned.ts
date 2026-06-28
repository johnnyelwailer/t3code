import type { AddToChatRequest } from "~/t3work/t3work-addToChatUtils";
import type { T3WorkDirectoryBundlePayload } from "~/t3work/t3work-contextDirectoryBundle";
import { buildWriteProgressUpdate } from "~/t3work/t3work-contextAttachmentSyncProgress";

export function persistServerOwnedDirectoryBundle(input: {
  request: AddToChatRequest;
  payload: T3WorkDirectoryBundlePayload;
  startedAt: string;
  onProgress?:
    | ((input: {
        update: ReturnType<typeof buildWriteProgressUpdate>;
        relativePath?: string;
      }) => void)
    | undefined;
}): string | undefined {
  const entryPoint =
    input.payload.fileReferences.find((reference) => reference.label === "Focused context")
      ?.relativePath ??
    input.payload.fileReferences.find((reference) => reference.label === "Ticket entrypoint")
      ?.relativePath ??
    input.payload.fileReferences[0]?.relativePath;
  input.onProgress?.({
    update: buildWriteProgressUpdate({
      request: input.request,
      payload: input.payload,
      startedAt: input.startedAt,
      completedCount: 1,
      ...(entryPoint ? { relativePath: entryPoint } : {}),
    }),
    ...(entryPoint ? { relativePath: entryPoint } : {}),
  });
  return entryPoint;
}
