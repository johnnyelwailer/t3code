import {
  PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES,
  type ChatAttachment,
  type EnvironmentId,
} from "@t3tools/contracts";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { create } from "zustand";

import type { ComposerAttachment } from "../composerDraftStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { attachmentEnvironment } from "../state/attachments";
import { readPreparedConnection } from "../state/session";
import type { AttachmentUploadState, ReadyAttachmentUpload } from "./attachmentUploadState";

const MAX_UPLOADS_PER_ENVIRONMENT = 3;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

interface AttachmentUploadStore {
  readonly uploadsByImageId: Readonly<Record<string, AttachmentUploadState>>;
}

export const useAttachmentUploadStore = create<AttachmentUploadStore>(() => ({
  uploadsByImageId: {},
}));

interface UploadJob {
  readonly attachment: ComposerAttachment;
  readonly environmentId: EnvironmentId;
  readonly previous?: ReadyAttachmentUpload;
  readonly settled: Promise<void>;
  resolveSettled: () => void;
  attachmentId: string | null;
  cancelled: boolean;
  abort: (() => void) | null;
}

const jobsByImageId = new Map<string, UploadJob>();
const queue: UploadJob[] = [];
const activeUploadsByEnvironment = new Map<EnvironmentId, number>();

function setUploadState(imageId: string, upload: AttachmentUploadState): void {
  useAttachmentUploadStore.setState((state) => ({
    uploadsByImageId: { ...state.uploadsByImageId, [imageId]: upload },
  }));
}

function clearUploadState(imageId: string): void {
  useAttachmentUploadStore.setState((state) => {
    if (!(imageId in state.uploadsByImageId)) {
      return state;
    }
    const uploadsByImageId = { ...state.uploadsByImageId };
    delete uploadsByImageId[imageId];
    return { uploadsByImageId };
  });
}

export function readAttachmentUpload(imageId: string): AttachmentUploadState | undefined {
  return useAttachmentUploadStore.getState().uploadsByImageId[imageId];
}

function deletePendingUpload(environmentId: EnvironmentId, attachmentId: string): void {
  void runAtomCommand(
    appAtomRegistry,
    attachmentEnvironment.remove,
    { environmentId, input: { attachmentId } },
    { reportFailure: false, reportDefect: false },
  );
}

function uploadBytes(input: {
  readonly url: string;
  readonly file: File;
  readonly onProgress: (progress: number) => void;
}): { readonly done: Promise<void>; readonly abort: () => void } {
  const xhr = new XMLHttpRequest();
  const done = new Promise<void>((resolve, reject) => {
    xhr.open("POST", input.url, true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", input.file.type);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        input.onProgress(event.loaded / event.total);
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload rejected (${xhr.status})`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(input.file);
  });

  return { done, abort: () => xhr.abort() };
}

async function runUpload(job: UploadJob): Promise<void> {
  const attachment = job.attachment;
  let mimeType: string;
  if (attachment.type === "image") {
    const supported = PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES.find(
      (supportedMimeType) => supportedMimeType === attachment.mimeType.toLowerCase(),
    );
    if (!supported) {
      setUploadState(attachment.id, {
        status: "failed",
        environmentId: job.environmentId,
        reason: "Unsupported image type",
        ...(job.previous ? { previous: job.previous } : {}),
      });
      return;
    }
    mimeType = supported;
  } else {
    // Arbitrary files: no server-side mime allow-list; the browser's
    // application/octet-stream fallback already covers empty File.type.
    mimeType = attachment.mimeType || "application/octet-stream";
  }

  const minted = await runAtomCommand(
    appAtomRegistry,
    attachmentEnvironment.createUploadUrl,
    {
      environmentId: job.environmentId,
      input: {
        name: attachment.name,
        mimeType,
        sizeBytes: attachment.file.size,
      },
    },
    { reportFailure: false },
  );
  if (job.cancelled) {
    if (minted._tag === "Success") {
      deletePendingUpload(job.environmentId, minted.value.attachmentId);
    }
    return;
  }
  if (minted._tag !== "Success") {
    setUploadState(job.attachment.id, {
      status: "failed",
      environmentId: job.environmentId,
      reason: "Upload could not start",
      ...(job.previous ? { previous: job.previous } : {}),
    });
    return;
  }
  job.attachmentId = minted.value.attachmentId;

  const connection = readPreparedConnection(job.environmentId);
  const url = connection ? resolveAssetUrl(connection.httpBaseUrl, minted.value.relativeUrl) : null;
  if (!url) {
    setUploadState(job.attachment.id, {
      status: "failed",
      environmentId: job.environmentId,
      reason: "Not connected",
      attachmentId: minted.value.attachmentId,
      ...(job.previous ? { previous: job.previous } : {}),
    });
    return;
  }

  let lastStep = -1;
  const upload = uploadBytes({
    url,
    file: job.attachment.file,
    onProgress: (progress) => {
      const step = Math.floor(progress * 20);
      if (step === lastStep || job.cancelled) {
        return;
      }
      lastStep = step;
      setUploadState(job.attachment.id, {
        status: "uploading",
        environmentId: job.environmentId,
        progress,
        ...(job.previous ? { previous: job.previous } : {}),
      });
    },
  });
  job.abort = upload.abort;

  try {
    await upload.done;
    if (job.cancelled) {
      return;
    }
    setUploadState(job.attachment.id, {
      status: "ready",
      environmentId: job.environmentId,
      attachmentId: minted.value.attachmentId,
    });
    if (job.previous) {
      deletePendingUpload(job.previous.environmentId, job.previous.attachmentId);
    }
  } catch (error) {
    if (job.cancelled) {
      return;
    }
    setUploadState(job.attachment.id, {
      status: "failed",
      environmentId: job.environmentId,
      reason: error instanceof Error ? error.message : "Upload failed",
      attachmentId: minted.value.attachmentId,
      ...(job.previous ? { previous: job.previous } : {}),
    });
  } finally {
    job.abort = null;
  }
}

function pumpUploads(): void {
  for (let index = 0; index < queue.length; ) {
    const job = queue[index]!;
    const active = activeUploadsByEnvironment.get(job.environmentId) ?? 0;
    if (active >= MAX_UPLOADS_PER_ENVIRONMENT) {
      index += 1;
      continue;
    }

    queue.splice(index, 1);
    if (job.cancelled) {
      continue;
    }
    activeUploadsByEnvironment.set(job.environmentId, active + 1);
    void runUpload(job)
      .catch(() => {
        if (!job.cancelled) {
          setUploadState(job.attachment.id, {
            status: "failed",
            environmentId: job.environmentId,
            reason: "Upload failed",
            ...(job.previous ? { previous: job.previous } : {}),
          });
        }
      })
      .finally(() => {
        if (jobsByImageId.get(job.attachment.id) === job) {
          jobsByImageId.delete(job.attachment.id);
        }
        const remaining = (activeUploadsByEnvironment.get(job.environmentId) ?? 1) - 1;
        if (remaining > 0) {
          activeUploadsByEnvironment.set(job.environmentId, remaining);
        } else {
          activeUploadsByEnvironment.delete(job.environmentId);
        }
        job.resolveSettled();
        pumpUploads();
      });
  }
}

export function startAttachmentUpload(input: {
  readonly environmentId: EnvironmentId;
  readonly attachment: ComposerAttachment;
}): void {
  const existingJob = jobsByImageId.get(input.attachment.id);
  if (existingJob?.environmentId === input.environmentId) {
    return;
  }

  const existing = readAttachmentUpload(input.attachment.id);
  if (existing?.status === "ready" && existing.environmentId === input.environmentId) {
    return;
  }
  if (existing?.status === "failed" && existing.environmentId === input.environmentId) {
    return;
  }
  if (
    existing &&
    "previous" in existing &&
    existing.previous?.environmentId === input.environmentId
  ) {
    cancelAttachmentUpload(input.attachment.id);
    if (existing.status === "failed" && existing.attachmentId) {
      deletePendingUpload(existing.environmentId, existing.attachmentId);
    }
    setUploadState(input.attachment.id, existing.previous);
    return;
  }

  if (existingJob) {
    cancelAttachmentUpload(input.attachment.id);
  }
  const previous = existing?.status === "ready" ? existing : existing?.previous;
  let resolveSettled: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  const job: UploadJob = {
    attachment: input.attachment,
    environmentId: input.environmentId,
    ...(previous ? { previous } : {}),
    settled,
    resolveSettled,
    attachmentId: null,
    cancelled: false,
    abort: null,
  };

  jobsByImageId.set(input.attachment.id, job);
  queue.push(job);
  setUploadState(input.attachment.id, {
    status: "uploading",
    environmentId: input.environmentId,
    progress: 0,
    ...(previous ? { previous } : {}),
  });
  pumpUploads();
}

export function cancelAttachmentUpload(imageId: string): void {
  const job = jobsByImageId.get(imageId);
  if (!job) {
    return;
  }
  job.cancelled = true;
  jobsByImageId.delete(imageId);
  const queuedIndex = queue.indexOf(job);
  if (queuedIndex !== -1) {
    queue.splice(queuedIndex, 1);
  }
  job.abort?.();
  if (job.attachmentId) {
    deletePendingUpload(job.environmentId, job.attachmentId);
  }
  job.resolveSettled();
}

export function releaseAttachmentUpload(imageId: string): void {
  const upload = readAttachmentUpload(imageId);
  cancelAttachmentUpload(imageId);
  if (upload?.status === "ready") {
    deletePendingUpload(upload.environmentId, upload.attachmentId);
  } else if (upload) {
    if (upload.status === "failed" && upload.attachmentId) {
      deletePendingUpload(upload.environmentId, upload.attachmentId);
    }
    if (upload.previous) {
      deletePendingUpload(upload.previous.environmentId, upload.previous.attachmentId);
    }
  }
  clearUploadState(imageId);
}

export function retryAttachmentUpload(input: {
  readonly environmentId: EnvironmentId;
  readonly attachment: ComposerAttachment;
}): void {
  const previous = readAttachmentUpload(input.attachment.id);
  cancelAttachmentUpload(input.attachment.id);
  if (previous?.status === "failed" && previous.attachmentId) {
    deletePendingUpload(previous.environmentId, previous.attachmentId);
  }
  if (previous && "previous" in previous && previous.previous) {
    setUploadState(input.attachment.id, previous.previous);
  } else {
    clearUploadState(input.attachment.id);
  }
  startAttachmentUpload(input);
}

export async function awaitAttachmentUploads(imageIds: ReadonlyArray<string>): Promise<void> {
  await Promise.all(imageIds.map((imageId) => jobsByImageId.get(imageId)?.settled));
}

export function getUploadedAttachments(input: {
  readonly environmentId: EnvironmentId;
  readonly images: ReadonlyArray<ComposerAttachment>;
}): ChatAttachment[] | null {
  const attachments: ChatAttachment[] = [];
  for (const image of input.images) {
    const upload = readAttachmentUpload(image.id);
    if (upload?.status !== "ready" || upload.environmentId !== input.environmentId) {
      return null;
    }
    attachments.push({
      type: image.type,
      id: upload.attachmentId,
      name: image.name,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
    });
  }
  return attachments;
}

export function releaseAttachmentUploads(images: ReadonlyArray<ComposerAttachment>): void {
  for (const image of images) {
    releaseAttachmentUpload(image.id);
  }
}
