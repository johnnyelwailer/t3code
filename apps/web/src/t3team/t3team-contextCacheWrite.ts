import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";

import { readProject, readThreadShell } from "~/state/entities";
import { postToEnvironment } from "~/t3team/backend/t3team-environmentWorkflowBackend";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  compactJson,
  isDirectoryBundlePayload,
  sanitizeForFileName,
  type AddToChatRequest,
} from "~/t3team/t3team-addToChatUtils";
import { persistContextAttachmentPayload } from "~/t3team/t3team-contextAttachmentSyncPersist";
import { T3TEAM_PROJECT_CONTEXT_ROOT } from "~/t3team/t3team-projectSetup";

const CONTEXT_FILES_ROUTE = "/api/t3team/project/workspace/context-files";

type ContextFile = { relativePath: string; contents: string; encoding?: "utf8" | "base64" };

function snapshotPath(request: AddToChatRequest, threadRef: ScopedThreadRef): string {
  return [
    T3TEAM_PROJECT_CONTEXT_ROOT,
    "threads",
    sanitizeForFileName(threadRef.threadId),
    `${sanitizeForFileName(request.dedupeKey ?? request.kind ?? request.targetLabel)}.json`,
  ].join("/");
}

function destinationWorkspaceRoot(threadRef: ScopedThreadRef): string {
  const shell = readThreadShell(threadRef);
  const project = shell
    ? readProject(scopeProjectRef(threadRef.environmentId, shell.projectId))
    : null;
  const root = shell?.worktreePath ?? project?.workspaceRoot;
  if (!root) throw new Error("The thread's workspace is not known on its environment yet.");
  return root;
}

async function writeToEnvironment(
  environmentId: EnvironmentId,
  workspaceRoot: string,
  files: ReadonlyArray<ContextFile>,
): Promise<void> {
  await postToEnvironment(environmentId, CONTEXT_FILES_ROUTE, { workspaceRoot, files });
}

/** Same environment as the drop: the existing context sync already writes where the agent reads. */
async function writeInSourceEnvironment(
  request: AddToChatRequest,
  backend: BackendApi,
): Promise<string> {
  const payload = typeof request.payload === "function" ? await request.payload() : request.payload;
  const relativePath = await persistContextAttachmentPayload({
    backend,
    request,
    payload,
    startedAt: new Date().toISOString(),
  });
  const entry = isDirectoryBundlePayload(payload)
    ? (payload.fileReferences[0]?.relativePath ?? payload.bundleRootRelativePath)
    : undefined;
  const cachedPath = relativePath ?? entry;
  if (!cachedPath) throw new Error("The item produced no cached file.");
  return cachedPath;
}

/**
 * Another environment's thread: its agent cannot read this machine's files and its server may
 * lack the credentials to resolve the item, so the copy travels as bytes and is written through
 * that environment's own server. The full record comes from the dragged-from environment; a
 * payload that already carries its files is written as is.
 */
async function writeInOtherEnvironment(
  request: AddToChatRequest,
  threadRef: ScopedThreadRef,
  addedAt: string,
): Promise<string> {
  const workspaceRoot = destinationWorkspaceRoot(threadRef);
  if (request.fullRecord !== undefined) {
    // Fetched from the dragged-from environment; a failure leaves the chip unavailable and the
    // write retries on mount, never a thinner copy standing in for the record.
    const record = await request.fullRecord();
    const relativePath = snapshotPath(request, threadRef);
    const contents = compactJson({
      capturedAt: addedAt,
      kind: request.kind ?? request.targetType,
      label: request.targetLabel,
      project: request.projectTitle,
      summary: request.summaryItems ?? [],
      record,
    });
    await writeToEnvironment(threadRef.environmentId, workspaceRoot, [{ relativePath, contents }]);
    return relativePath;
  }
  const payload = typeof request.payload === "function" ? await request.payload() : request.payload;
  if (isDirectoryBundlePayload(payload) && payload.files.length > 0) {
    await writeToEnvironment(threadRef.environmentId, workspaceRoot, payload.files);
    return payload.fileReferences[0]?.relativePath ?? payload.bundleRootRelativePath;
  }
  if (isDirectoryBundlePayload(payload)) {
    throw new Error("The full record only exists on the machine it was dragged from.");
  }
  const relativePath = snapshotPath(request, threadRef);
  await writeToEnvironment(threadRef.environmentId, workspaceRoot, [
    { relativePath, contents: compactJson({ capturedAt: addedAt, snapshot: payload }) },
  ]);
  return relativePath;
}

/** Returns the path, valid in the thread's own environment, where the cached copy now lives. */
export function writeContextCache(input: {
  request: AddToChatRequest;
  threadRef: ScopedThreadRef;
  addedAt: string;
  sourceEnvironmentId: EnvironmentId | null;
  backend: BackendApi | null;
}): Promise<string> {
  const { request, threadRef, backend } = input;
  if (threadRef.environmentId === input.sourceEnvironmentId) {
    return backend
      ? writeInSourceEnvironment(request, backend)
      : Promise.reject(new Error("The backend for this environment is unavailable."));
  }
  return writeInOtherEnvironment(request, threadRef, input.addedAt);
}
