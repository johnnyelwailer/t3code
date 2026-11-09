/**
 * Opens a peer actor thread by navigation: a peer is not a fork of this thread, so it never opens
 * as a side chat. Injected so the actor-message card stays router-agnostic.
 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export function useT3TeamOpenSenderThread(
  parentThreadId: string,
): (input: { projectId: string; threadId: string }) => void {
  const navigate = useNavigate();
  return useCallback(
    (input: { projectId: string; threadId: string }) => {
      // Workflows whose steps run on the launch thread link every step row to the current thread.
      if (input.threadId === parentThreadId) {
        return;
      }
      void navigate({
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: { projectId: input.projectId, threadId: input.threadId },
      });
    },
    [navigate, parentThreadId],
  );
}
