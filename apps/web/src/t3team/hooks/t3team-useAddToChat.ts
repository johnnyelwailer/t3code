import { useCallback } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useT3TeamActiveChatStore } from "~/t3team/t3team-activeChatStore";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { useBackend } from "~/t3team/backend/t3team-index";
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
import { parseActiveThreadFromPath } from "~/t3team/t3team-threadRoutePath";

function addContextAttachmentToThread(threadId: string, attachment: T3TeamContextAttachment): void {
  useT3TeamAddToChatStore.getState().enqueueThreadAttachment(threadId, attachment);
}

export type AddToChatTarget =
  | { type: "thread"; threadId: string }
  | { type: "kickoff"; projectId: string; ticketId: string };

type ResolvedAddToChatTarget = AddToChatTarget | { type: "project"; projectId: string };

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

export function useAddToChat() {
  const backend = useBackend();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeChatTarget = useT3TeamActiveChatStore((state) => state.target);

  const addToChatFromRequest = useCallback(
    async (request: AddToChatRequest, target?: AddToChatTarget) => {
      const resolvedTarget: ResolvedAddToChatTarget = target
        ? target
        : activeChatTarget && activeChatTarget.projectId === request.projectId
          ? activeChatTarget.type === "thread"
            ? { type: "thread", threadId: activeChatTarget.threadId }
            : {
                type: "kickoff",
                projectId: request.projectId,
                ticketId: activeChatTarget.ticketId,
              }
          : (() => {
              const activeThread = parseActiveThreadFromPath(pathname);
              if (activeThread && activeThread.projectId === request.projectId) {
                return { type: "thread" as const, threadId: activeThread.threadId };
              }
              return { type: "project" as const, projectId: request.projectId };
            })();

      const attachment = buildPendingContextAttachment({ request });
      registerContextAttachmentRequest(attachment.id, request);
      enqueueAttachmentForTarget(resolvedTarget, attachment);

      void syncContextAttachmentFromRequest({
        attachmentId: attachment.id,
        request,
        ...(backend ? { backend } : {}),
        onUpdate: (nextAttachment) => {
          routeAttachmentUpdateToTarget(resolvedTarget, attachment.id, nextAttachment);
        },
      }).catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to sync attached context.";
        routeAttachmentUpdateToTarget(
          resolvedTarget,
          attachment.id,
          buildContextAttachment({
            id: attachment.id,
            request,
            syncStatus: "error",
            syncError: message,
          }),
        );
      });
    },
    [activeChatTarget, backend, pathname],
  );

  return {
    addToChatFromRequest,
  };
}
