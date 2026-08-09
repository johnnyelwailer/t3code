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
      // Opening the thread you are already in is not navigation — it is a duplicate mount.
      // This helper puts the target in `chatThreadId` beside the current thread, so a target equal
      // to the current thread produced `{threadId: X, embeddedThreadId: X}` and `AppThreadPane`
      // rendered X in BOTH panes: two timelines, two composers, one suspended ask with two places
      // to answer it. Workflows whose steps run on the launch thread (the `describe-rewrite` body
      // does this deliberately — a child thread has no tool context and is invisible) make every
      // one of their step rows a link to the current thread, so this was one click away.
      if (input.threadId === parentThreadId) {
        return;
      }

      void navigate({
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: { projectId: input.projectId, threadId: parentThreadId },
        search: { chatThreadId: input.threadId },
      });
    },
    [navigate, parentThreadId],
  );
}
