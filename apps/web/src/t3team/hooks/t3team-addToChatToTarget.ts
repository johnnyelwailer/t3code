import type { BackendApi } from "~/t3team/backend/t3team-types";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import {
  registerContextAttachmentRequest,
  syncContextAttachmentFromRequest,
} from "~/t3team/t3team-contextAttachmentSync";
import {
  buildContextAttachment,
  buildPendingContextAttachment,
  type AddToChatRequest,
} from "~/t3team/t3team-addToChatUtils";

function addContextAttachmentToThread(threadId: string, attachment: T3TeamContextAttachment): void {
  useT3TeamAddToChatStore.getState().enqueueThreadAttachment(threadId, attachment);
}

export type AddToChatTarget =
  | { type: "thread"; threadId: string }
  | { type: "kickoff"; projectId: string; ticketId: string };

export type ResolvedAddToChatTarget = AddToChatTarget | { type: "project"; projectId: string };

function enqueueAttachmentForTarget(
  target: ResolvedAddToChatTarget,
  attachment: T3TeamContextAttachment,
): void {
  if (target.type === "thread") {
    addContextAttachmentToThread(target.threadId, attachment);
    return;
  }

  if (target.type === "kickoff") {
    useT3TeamAddToChatStore.getState().enqueueKickoff({
      projectId: target.projectId,
      ticketId: target.ticketId,
      attachment,
      createdAt: new Date().toISOString(),
    });
    return;
  }

  useT3TeamAddToChatStore.getState().enqueue({
    projectId: target.projectId,
    attachment,
    createdAt: new Date().toISOString(),
  });
}

function routeAttachmentUpdateToTarget(
  target: ResolvedAddToChatTarget,
  attachmentId: string,
  attachment: T3TeamContextAttachment,
): void {
  const state = useT3TeamAddToChatStore.getState();
  if (target.type === "thread") {
    state.replaceThreadAttachment(target.threadId, attachmentId, attachment);
    return;
  }
  if (target.type === "kickoff") {
    const replaced = state.replaceKickoffAttachment(
      target.projectId,
      target.ticketId,
      attachmentId,
      attachment,
    );
    if (!replaced) {
      enqueueAttachmentForTarget(target, attachment);
    }
    return;
  }

  const replaced = state.replaceProjectAttachment(target.projectId, attachmentId, attachment);
  if (!replaced) {
    enqueueAttachmentForTarget(target, attachment);
  }
}

/** Queues the request's context on `target` and syncs it in the background. No React state, so a
 * row that is not the active chat can call it without subscribing to the router. */
export function addRequestToTarget(input: {
  request: AddToChatRequest;
  target: ResolvedAddToChatTarget;
  backend?: BackendApi | null | undefined;
}): void {
  const { request, target, backend } = input;
  const attachment = buildPendingContextAttachment({ request });
  registerContextAttachmentRequest(attachment.id, request);
  enqueueAttachmentForTarget(target, attachment);

  void syncContextAttachmentFromRequest({
    attachmentId: attachment.id,
    request,
    ...(backend ? { backend } : {}),
    onUpdate: (nextAttachment) => {
      routeAttachmentUpdateToTarget(target, attachment.id, nextAttachment);
    },
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "Failed to sync attached context.";
    routeAttachmentUpdateToTarget(
      target,
      attachment.id,
      buildContextAttachment({
        id: attachment.id,
        request,
        syncStatus: "error",
        syncError: message,
      }),
    );
  });
}
