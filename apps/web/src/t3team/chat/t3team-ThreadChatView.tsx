import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { ProjectSource } from "@t3tools/project-context";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useBackend } from "~/t3team/backend/t3team-index";
import { toastManager } from "~/components/ui/toast";
import { ThreadChatViewBody } from "~/t3team/chat/t3team-ThreadChatViewBody";
import { ExternalSessionReadOnlyOverlay } from "~/t3team/chat/t3team-ExternalSessionReadOnlyOverlay";
import { useExternalSessionReadOnly } from "~/t3team/chat/t3team-useExternalSessionReadOnly";
import { useKickoffBranch } from "~/t3team/chat/t3team-useKickoffBranch";
import { useThreadBootstrap } from "~/t3team/chat/t3team-useThreadBootstrap";
import { useThreadChatComposerState } from "~/t3team/chat/t3team-useThreadChatComposerState";
import { useT3TeamDraftMutationIngest } from "~/t3team/chat/t3team-useDraftMutationIngest";
import { useThreadChatDebug } from "~/t3team/chat/t3team-useThreadChatDebug";
import { useThreadChatServerState } from "~/t3team/chat/t3team-useThreadChatServerState";
import { useThreadChatTurnToolContext } from "~/t3team/chat/t3team-useThreadChatTurnToolContext";
import type { T3TeamKickoffWorkflow, T3TeamThreadToolId } from "~/t3team/t3team-types";

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

export interface ThreadChatViewProps {
  threadId: string;
  projectId: string;
  projectTitle: string;
  projectSource?: Pick<ProjectSource, "provider">;
  projectWorkspaceRoot?: string;
  title: string;
  onBack?: () => void;
  titleBarControlsAccessory?: React.ReactNode;
  hideHeader?: boolean;
  embeddedMode?: boolean;
  kickoffMessage?: string;
  kickoffPending?: boolean;
  kickoffWorkflow?: T3TeamKickoffWorkflow;
  initialUserMessage?: string;
  initialModelSelection?: ModelSelection;
  initialRuntimeMode?: RuntimeMode;
  initialInteractionMode?: ProviderInteractionMode;
  ticketId?: string;
  ticketDisplayId?: string;
  selectedToolIds?: ReadonlyArray<T3TeamThreadToolId>;
  onInitialUserMessageSent?: () => void;
}

export function ThreadChatView({
  threadId,
  projectId,
  projectTitle,
  projectSource,
  projectWorkspaceRoot,
  title,
  onBack,
  titleBarControlsAccessory,
  hideHeader = false,
  embeddedMode = false,
  kickoffMessage,
  kickoffPending,
  kickoffWorkflow,
  initialUserMessage,
  initialModelSelection,
  initialRuntimeMode,
  initialInteractionMode,
  ticketId,
  ticketDisplayId,
  selectedToolIds,
  onInitialUserMessageSent,
}: ThreadChatViewProps) {
  const backend = useBackend();
  const navigate = useNavigate();
  const {
    canonicalProjectId,
    environmentId,
    hasServerLaunchActivity,
    hasServerThread,
    kickoffHistoryMessage,
    projectExists,
    serverThread,
    serverThreadSummary,
    showKickoffPlaceholder,
  } = useThreadChatServerState({
    threadId,
    projectId,
    projectWorkspaceRoot,
    kickoffMessage,
    kickoffPending,
    kickoffWorkflow,
  });
  const turnToolContext = useThreadChatTurnToolContext({
    embeddedMode,
    projectId,
    projectTitle,
    projectSource,
    projectWorkspaceRoot,
    kickoffMessage,
    kickoffPending,
    kickoffWorkflow,
    selectedToolIds,
    threadId,
    ticketId,
    ticketDisplayId,
    title,
  });

  const { initialBranch } = useKickoffBranch({
    environmentId,
    projectWorkspaceRoot,
  });

  const { bootstrapStatus, retryThreadBootstrap } = useThreadBootstrap({
    backend,
    environmentId,
    threadId,
    projectTitle,
    projectWorkspaceRoot,
    canonicalProjectId,
    projectExists,
    title,
    initialUserMessage,
    initialModelSelection,
    initialRuntimeMode,
    initialInteractionMode,
    initialBranch,
    kickoffWorkflow,
    initialToolContext: turnToolContext,
    onInitialUserMessageSent,
    serverThread,
  });

  useT3TeamDraftMutationIngest({ environmentId, threadId });

  useThreadChatDebug({
    environmentId,
    projectId,
    threadId,
    projectWorkspaceRoot,
    canonicalProjectId,
    projectExists,
    hasInitialUserMessage: Boolean(initialUserMessage),
    hasServerThread,
    serverThreadSummary,
  });
  const composerState = useThreadChatComposerState({
    backend,
    projectId,
    threadId,
    ...(ticketId ? { ticketId } : {}),
    turnToolContext,
    kickoffPending,
    kickoffWorkflow,
    hasServerLaunchActivity,
    embeddedMode,
  });

  // A thread mirrored from an external Codex/Claude session is read-only while that tool still
  // owns it. The composer is COVERED rather than removed, so the transcript stays readable and
  // the row does not appear broken.
  //
  // Called unconditionally, before the `!environmentId` early return below: hooks must run in
  // the same order on every render, and `environmentId` can still be undefined on the first
  // render of a freshly opened thread (it resolves once thread state loads). Calling this hook
  // only after that early return meant the hook count differed between the "not yet resolved"
  // and "resolved" renders of the SAME component instance, which React surfaces as "Rendered
  // more hooks than during the previous render" — reproducing once per thread open, right when
  // environmentId flips from undefined to set (e.g. opening a thread with a workflow run card).
  const externalSession = useExternalSessionReadOnly(serverThread);

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

  if (!environmentId) {
    return <div className="flex h-full min-h-0 flex-1 bg-background" />;
  }

  return (
    <ThreadChatViewBody
      environmentId={environmentId}
      threadId={threadId}
      projectId={projectId}
      {...(ticketId ? { ticketId } : {})}
      hasServerThread={hasServerThread}
      showKickoffPlaceholder={showKickoffPlaceholder}
      kickoffMessage={kickoffMessage}
      kickoffPending={kickoffPending}
      kickoffWorkflow={kickoffWorkflow}
      kickoffHistoryMessage={kickoffHistoryMessage}
      onBack={onBack}
      titleBarControlsAccessory={titleBarControlsAccessory}
      hideHeader={hideHeader}
      embeddedMode={embeddedMode}
      backend={backend}
      bootstrapStatus={bootstrapStatus}
      retryThreadBootstrap={retryThreadBootstrap}
      composerState={composerState}
      onForkThread={forkFromMessage}
      {...(externalSession.active && externalSession.session
        ? {
            composerReadOnlyOverlay: (
              <ExternalSessionReadOnlyOverlay
                session={externalSession.session}
                onForkConversation={forkExternalConversation}
              />
            ),
          }
        : {})}
    />
  );
}
