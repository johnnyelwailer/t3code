/**
 * Opening a peer actor thread (actors share a project).
 *
 * The canonical path opens the peer as a "side chat": a `thread:` surface in the CURRENT
 * thread's right panel — a standard tab beside Files/Agents/Preview, no navigation.
 * Embedded panes (the ticket/dashboard detail pane and the side-chat tab itself) have no
 * right panel of their own, so they fall back to plain navigation to the target thread.
 *
 * Extracted as a hook so the actor-message timeline card stays presentational /
 * router-agnostic: the callback is injected into ChatView → the timeline row
 * context (mirroring how the workflow-decision card receives its dispatch). The
 * `_chat` surface, which does not provide this, simply hides the card's control.
 */
import { useNavigate } from "@tanstack/react-router";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback } from "react";
import { useRightPanelStore } from "~/rightPanelStore";

export function useT3TeamOpenSenderThread(
  parentThreadId: string,
  activeThreadRef: ScopedThreadRef | null,
  embeddedMode: boolean,
): (input: { projectId: string; threadId: string }) => void {
  const navigate = useNavigate();
  return useCallback(
    (input: { projectId: string; threadId: string }) => {
      // Opening the thread you are already in is not navigation — it is a duplicate mount:
      // two timelines, two composers, one suspended `askUser` with two places to answer it.
      // Workflows whose steps run on the launch thread make every one of their step rows a
      // link to the current thread, so this was one click away.
      if (input.threadId === parentThreadId) {
        return;
      }
      if (embeddedMode || activeThreadRef === null) {
        // This pane owns no right panel of its own (or the thread's environment is not
        // resolved yet): navigate to the peer instead of opening a surface it cannot host.
        void navigate({
          to: "/t3team/projects/$projectId/threads/$threadId",
          params: { projectId: input.projectId, threadId: input.threadId },
        });
        return;
      }
      useRightPanelStore.getState().openThreadSurface(activeThreadRef, input.threadId);
    },
    [activeThreadRef, embeddedMode, navigate, parentThreadId],
  );
}
