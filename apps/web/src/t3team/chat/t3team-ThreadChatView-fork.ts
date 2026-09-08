import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toastManager } from "~/components/ui/toast";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { useThread } from "~/state/entities";

function normalizeForkError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Request to /api/t3team/thread/fork failed with 404")) {
    return "Fork endpoint is not available on the running backend. Rebuild/restart the server to load the new route.";
  }
  if (message.includes("Failed to reach backend")) {
    return "Could not reach the backend to fork this thread. Check server status and retry.";
  }
  return message;
}

export function useThreadChatForkHandlers({
  backend,
  environmentId,
  projectId,
  serverThread,
  threadId,
}: {
  backend: BackendApi | null | undefined;
  environmentId: string | null | undefined;
  projectId: string;
  serverThread: ReturnType<typeof useThread>;
  threadId: string;
}) {
  const navigate = useNavigate();

  const forkExternalConversation = useCallback(async () => {
    if (!environmentId || !backend) return;
    try {
      const response = await backend.forkThread({
        threadId,
        ...(serverThread?.title ? { title: `${serverThread.title} (fork)` } : {}),
      });
      await navigate({
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: {
          projectId,
          threadId: response.childThreadId,
        },
      });
    } catch (error) {
      throw new Error(normalizeForkError(error));
    }
  }, [backend, environmentId, navigate, projectId, serverThread, threadId]);

  // Fork from a specific message: the child thread carries messages up to and
  // including the clicked one (branch point). Long transcripts are truncated
  // server-side, so this never blocks on a summarizer.
  const forkFromMessage = useCallback(
    async (input: { readonly messageId: string }) => {
      if (!environmentId || !backend) return;
      try {
        const response = await backend.forkThread({
          threadId,
          upToMessageId: input.messageId,
          ...(serverThread?.title ? { title: `${serverThread.title} (fork)` } : {}),
        });
        await navigate({
          to: "/t3team/projects/$projectId/threads/$threadId",
          params: {
            projectId,
            threadId: response.childThreadId,
          },
        });
      } catch (error) {
        // The per-message button fires-and-forgets (void onClick), so surface
        // failures here — an unthrown error would be a silent no-op.
        toastManager.add({
          type: "error",
          title: "Fork failed",
          description: normalizeForkError(error),
        });
      }
    },
    [backend, environmentId, navigate, projectId, serverThread, threadId],
  );

  return { forkExternalConversation, forkFromMessage };
}
