import { useCallback } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useT3TeamActiveChatStore } from "~/t3team/t3team-activeChatStore";
import { useBackend } from "~/t3team/backend/t3team-index";
import {
  addRequestToTarget,
  type AddToChatTarget,
  type ResolvedAddToChatTarget,
} from "~/t3team/hooks/t3team-addToChatToTarget";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { parseActiveThreadFromPath } from "~/t3team/t3team-threadRoutePath";

export type { AddToChatTarget };

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

      addRequestToTarget({ request, target: resolvedTarget, backend });
    },
    [activeChatTarget, backend, pathname],
  );

  return {
    addToChatFromRequest,
  };
}
