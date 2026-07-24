/**
 * Router navigation for opening a peer actor thread (actors share a project).
 *
 * Extracted as a hook so the actor-message timeline card stays presentational /
 * router-agnostic: the callback is injected into ChatView → the timeline row
 * context (mirroring how the workflow-decision card receives its dispatch). The
 * `_chat` surface, which does not provide this, simply hides the card's control.
 *
 * @module t3team-useOpenSenderThread
 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export function useT3TeamOpenSenderThread(
  parentThreadId: string,
): (input: { projectId: string; threadId: string }) => void {
  const navigate = useNavigate();
  return useCallback(
    (input: { projectId: string; threadId: string }) => {
      void navigate({
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: { projectId: input.projectId, threadId: parentThreadId },
        search: { chatThreadId: input.threadId },
      });
    },
    [navigate, parentThreadId],
  );
}
