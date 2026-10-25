/**
 * Carries out the flusher's decision for one queued cloud send. The one-shot requests (connect,
 * open the machine's scratch project) are remembered per message in `requests`, so a re-render
 * does not repeat them; a retry or a cleared message starts over (`pruneCloudQueuedSendRequests`).
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { CloudSession, EnvironmentId, ThreadId } from "@t3tools/contracts";

import { finalizePromotedDraftThreadByRef } from "~/composerDraftStore";
import {
  completeCloudQueuedSend,
  dispatchCloudQueuedSend,
  type StartCloudQueuedTurn,
} from "./t3team-cloudQueuedSendDispatch";
import {
  type CloudProjectWaitLogSink,
  logCloudProjectWaitOutcome,
  resolvedOutcomeOf,
} from "./t3team-cloudProjectWaitLog";
import type { CloudQueuedSendFlushAction } from "./t3team-cloudQueuedSendFlush";
import type { MachineProjectBinding } from "./t3team-cloudSessionMachineProject";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  failDraftCloudQueuedSend,
  updateDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";

export const CLOUD_QUEUED_SEND_SCRATCH_FAILED_MESSAGE =
  "Could not open a folder for this thread on the cloud machine.";

/** messageId -> what was already requested for it ("connect:<sessionId>", "scratch:<env>"). */
export type CloudQueuedSendRequests = Map<string, string>;

export interface CloudQueuedSendActionContext {
  readonly draftId: string;
  readonly queued: CloudQueuedSend;
  readonly threadId: ThreadId;
  readonly projectCwd: string | null;
  readonly requests: CloudQueuedSendRequests;
  /** Off the draft's own page the promoted draft is retired at once; on it, its route does. */
  readonly draftPageOpen: boolean;
  readonly connect: (session: CloudSession) => void;
  /** `useScratchProject().openScratchProject`: resolves to the project, or null on failure. */
  readonly openScratchProject: (
    environmentId: EnvironmentId,
  ) => Promise<{ readonly id: string } | null>;
  readonly startTurn: StartCloudQueuedTurn;
  /** What the "Project ready" wait's outcome line says; the clock is the caller's. */
  readonly projectWaitLog?: {
    readonly nowMs: number;
    readonly resolvedBy: MachineProjectBinding | null;
    readonly sink?: CloudProjectWaitLogSink;
  };
}

export function applyCloudQueuedSendAction(
  action: CloudQueuedSendFlushAction,
  ctx: CloudQueuedSendActionContext,
): void {
  const { draftId, queued, requests } = ctx;
  const retire = (environmentId: EnvironmentId) => {
    if (!ctx.draftPageOpen)
      finalizePromotedDraftThreadByRef(scopeThreadRef(environmentId, ctx.threadId));
  };
  const once = (request: string, run: () => void) => {
    if (requests.get(queued.messageId) === request) return;
    requests.set(queued.messageId, request);
    run();
  };
  switch (action.kind) {
    case "wait":
      return;
    case "resolve-session":
      updateDraftCloudQueuedSend(draftId, queued.messageId, (current) => ({
        ...current,
        sessionId: action.sessionId,
        sessionLabel: action.label,
      }));
      return;
    case "connect":
      once(`connect:${action.session.sessionId}`, () => ctx.connect(action.session));
      return;
    case "open-scratch":
      once(`scratch:${action.environmentId}`, () => {
        void ctx.openScratchProject(action.environmentId).then((project) => {
          if (project === null) {
            failDraftCloudQueuedSend(
              draftId,
              queued.messageId,
              CLOUD_QUEUED_SEND_SCRATCH_FAILED_MESSAGE,
              true,
            );
          }
        });
      });
      return;
    case "fail": {
      requests.delete(queued.messageId);
      const failure = action.failure;
      if (ctx.projectWaitLog !== undefined && failure !== undefined) {
        logCloudProjectWaitOutcome(
          {
            queued,
            outcome: failure.kind === "session_ended" ? "ended" : "failed",
            environmentId: failure.environmentId,
            reason: failure.reason,
            nowMs: ctx.projectWaitLog.nowMs,
          },
          ctx.projectWaitLog.sink,
        );
      }
      failDraftCloudQueuedSend(
        draftId,
        queued.messageId,
        action.message,
        action.retryable,
        failure?.kind === "project_not_resolved"
          ? { kind: failure.kind, reason: failure.reason }
          : undefined,
      );
      return;
    }
    case "delivered":
      completeCloudQueuedSend(draftId, action.environmentId, ctx.threadId);
      retire(action.environmentId);
      return;
    case "dispatch":
      if (ctx.projectWaitLog !== undefined) {
        logCloudProjectWaitOutcome(
          {
            queued,
            outcome: resolvedOutcomeOf(ctx.projectWaitLog.resolvedBy),
            environmentId: action.environmentId,
            reason: null,
            nowMs: ctx.projectWaitLog.nowMs,
          },
          ctx.projectWaitLog.sink,
        );
      }
      void dispatchCloudQueuedSend({
        draftId,
        messageId: queued.messageId,
        environmentId: action.environmentId,
        projectId: action.projectId,
        projectCwd: ctx.projectCwd,
        startTurn: ctx.startTurn,
      }).then((outcome) => {
        if (outcome === "sent") retire(action.environmentId);
      });
      return;
  }
}

/** A connect failure only parks a message when this flusher asked for that connect. */
export function connectRequestedFor(
  requests: CloudQueuedSendRequests,
  messageId: string,
): string | null {
  const request = requests.get(messageId);
  return request?.startsWith("connect:") ? request.slice("connect:".length) : null;
}

/** Retried or cleared messages start over with fresh requests. */
export function pruneCloudQueuedSendRequests(
  requests: CloudQueuedSendRequests,
  queued: ReadonlyArray<CloudQueuedSend>,
): void {
  for (const messageId of requests.keys()) {
    if (!queued.some((item) => item.messageId === messageId && item.failureMessage === undefined)) {
      requests.delete(messageId);
    }
  }
}
