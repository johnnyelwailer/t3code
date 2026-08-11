import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { ProjectSource } from "@t3tools/project-context";
import { useEnvironmentQuery } from "~/state/query";
import { vcsEnvironment } from "~/state/vcs";
import { useBackend } from "~/t3team/backend/t3team-index";
import { ThreadChatViewBody } from "~/t3team/chat/t3team-ThreadChatViewBody";
import { ExternalSessionReadOnlyOverlay } from "~/t3team/chat/t3team-ExternalSessionReadOnlyOverlay";
import { useExternalSessionReadOnly } from "~/t3team/chat/t3team-useExternalSessionReadOnly";
import { useThreadBootstrap } from "~/t3team/chat/t3team-useThreadBootstrap";
import { useThreadChatComposerState } from "~/t3team/chat/t3team-useThreadChatComposerState";
import { useT3TeamDraftMutationIngest } from "~/t3team/chat/t3team-useDraftMutationIngest";
import { useThreadChatDebug } from "~/t3team/chat/t3team-useThreadChatDebug";
import { useThreadChatServerState } from "~/t3team/chat/t3team-useThreadChatServerState";
import { useThreadChatTurnToolContext } from "~/t3team/chat/t3team-useThreadChatTurnToolContext";
import type { T3TeamKickoffWorkflow, T3TeamThreadToolId } from "~/t3team/t3team-types";

const DETACHED_HEAD_SHA_PATTERN = /^[0-9a-f]{40}$/i;

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

  // Kickoff threads carry the workspace's current branch, same as the composer footer's branch
  // chip: both read it from the workspace's git status rather than a thread that does not exist
  // yet. The underlying Effect atom (see ~/state/query.ts) dedupes this against the composer's
  // own query for the same cwd, so this
  // adds no extra request.
  const kickoffGitStatusQuery = useEnvironmentQuery(
    !environmentId || !projectWorkspaceRoot
      ? null
      : vcsEnvironment.status({
          environmentId,
          input: { cwd: projectWorkspaceRoot },
        }),
  );
  const rawKickoffRefName = kickoffGitStatusQuery.data?.refName;
  // A 40-hex refName means detached HEAD (git status reports the raw sha, not a branch name) —
  // kickoff should carry no branch rather than a sha that can't be checked out as one.
  const initialBranch =
    rawKickoffRefName && !DETACHED_HEAD_SHA_PATTERN.test(rawKickoffRefName)
      ? rawKickoffRefName
      : undefined;
  // The bootstrap kickoff dispatch must not fire before this query resolves: an unresolved
  // workspace root means we don't yet know the branch, and dispatching early sends branch:null
  // for what should have been a real branch. `isPending` clears once the query settles, even on
  // error, so a hanging query can't block kickoff forever.
  const isKickoffBranchQueryPending =
    Boolean(projectWorkspaceRoot) && kickoffGitStatusQuery.isPending;

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
    isKickoffBranchQueryPending,
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
  });

  if (!environmentId) {
    return <div className="flex h-full min-h-0 flex-1 bg-background" />;
  }

  // A thread mirrored from an external Codex/Claude session is read-only while that tool still
  // owns it. The composer is COVERED rather than removed, so the transcript stays readable and
  // the row does not appear broken.
  const externalSession = useExternalSessionReadOnly(serverThread);

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
      {...(externalSession.active && externalSession.session
        ? {
            composerReadOnlyOverlay: (
              <ExternalSessionReadOnlyOverlay session={externalSession.session} />
            ),
          }
        : {})}
    />
  );
}
