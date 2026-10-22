import {
  AuthOrchestrationOperateScope,
  type ChatAttachment,
  type EnvironmentId,
} from "@t3tools/contracts";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { runAttachmentUploadCycle } from "@t3tools/client-runtime/state/attachments";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { attachmentEnvironment } from "~/state/attachments";
import { readEnvironmentScope, readPreparedConnection } from "~/state/session";

const UPLOAD_TIMEOUT_MS = 30_000;

function postBytes(url: string, file: File, mimeType: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  const done = fetch(url, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: file,
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Upload rejected (${response.status})`);
    })
    .finally(() => clearTimeout(timer));
  return { done, abort: () => controller.abort() };
}

/**
 * Uploads one small generated file (no draft, no composer row) through the same upload cycle the
 * composer uses, and returns it as a message attachment; null when this connection cannot upload
 * or the upload failed. Used for a voice transcript's metadata file.
 */
export async function uploadVoiceFileAttachment(input: {
  readonly environmentId: EnvironmentId;
  readonly file: File;
}): Promise<ChatAttachment | null> {
  if (!readEnvironmentScope(input.environmentId, AuthOrchestrationOperateScope)) return null;
  const mimeType = input.file.type.toLowerCase() || "application/octet-stream";
  const result = await runAttachmentUploadCycle({
    registry: appAtomRegistry,
    createUploadUrl: attachmentEnvironment.createUploadUrl,
    remove: attachmentEnvironment.remove,
    environmentId: input.environmentId,
    upload: { type: "file" as const, name: input.file.name, mimeType, sizeBytes: input.file.size },
    resolveUploadUrl: (relativeUrl) => {
      const connection = readPreparedConnection(input.environmentId);
      return connection ? resolveAssetUrl(connection.httpBaseUrl, relativeUrl) : null;
    },
    transport: (url) => postBytes(url, input.file, mimeType),
    onMinted: () => "continue",
    onTransferStart: () => undefined,
  });
  if (result.status !== "uploaded") return null;
  return {
    type: "file",
    id: result.attachmentId,
    name: input.file.name,
    mimeType,
    sizeBytes: input.file.size,
  };
}
