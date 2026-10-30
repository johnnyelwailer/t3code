import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { AgentContextToolDefinition } from "~/t3team/t3team-agentContext";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { writeContextCache } from "~/t3team/t3team-contextCacheWrite";
import { buildContextPointerAttachment } from "~/t3team/t3team-referenceContextAttachment";

type ContextCacheJob = {
  readonly request: AddToChatRequest;
  readonly threadRef: ScopedThreadRef;
  readonly tool: AgentContextToolDefinition | undefined;
  readonly addedAt: string;
  inFlight: boolean;
};

export type ContextCacheEnvironment = {
  readonly sourceEnvironmentId: EnvironmentId | null;
  readonly backend: BackendApi | null;
};

const jobs = new Map<string, ContextCacheJob>();

export function registerContextCacheJob(id: string, job: Omit<ContextCacheJob, "inFlight">): void {
  jobs.set(id, { ...job, inFlight: false });
}

export function isContextCacheAttachment(id: string): boolean {
  return jobs.has(id);
}

function publish(
  id: string,
  job: ContextCacheJob,
  state: Parameters<typeof buildContextPointerAttachment>[0]["state"],
) {
  useT3TeamAddToChatStore.getState().replaceThreadAttachment(
    job.threadRef.threadId,
    id,
    buildContextPointerAttachment({
      id,
      request: job.request,
      tool: job.tool,
      addedAt: job.addedAt,
      state,
    }),
  );
}

/**
 * Writes the cached copy in the background and flips the draft chip from pending to ready or
 * error. Nothing awaits it: the caller has already navigated and the send path never reads it.
 */
export function runContextCacheJob(id: string, environment: ContextCacheEnvironment): void {
  const job = jobs.get(id);
  if (!job || job.inFlight) return;
  job.inFlight = true;
  void writeContextCache({
    request: job.request,
    threadRef: job.threadRef,
    addedAt: job.addedAt,
    ...environment,
  }).then(
    (cachedPath) => {
      jobs.delete(id);
      publish(id, job, { status: "ready", cachedPath });
    },
    (error: unknown) => {
      job.inFlight = false;
      publish(id, job, {
        status: "error",
        reason: error instanceof Error ? error.message : "The copy could not be written.",
      });
    },
  );
}

/** Retry-on-mount: a job that failed or never started runs again when its thread's composer mounts. */
export function retryContextCacheJobs(
  threadId: string,
  environment: ContextCacheEnvironment,
): void {
  const queued = new Set(
    (useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId[threadId] ?? []).map(
      (attachment) => attachment.id,
    ),
  );
  for (const [id, job] of jobs) {
    if (job.threadRef.threadId !== threadId) continue;
    if (!queued.has(id)) jobs.delete(id);
    else runContextCacheJob(id, environment);
  }
}
