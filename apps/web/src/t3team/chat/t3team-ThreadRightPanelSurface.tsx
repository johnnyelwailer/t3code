/**
 * The "side chat" right-panel surface: another thread rendered as a standard right-panel tab.
 *
 * A side chat is a `thread:` surface in the right-panel store (see rightPanelStore.ts); this
 * component is its content. It reuses the embedded ThreadChatView the way the legacy `?chatThreadId`
 * split did (hideHeader + embeddedMode). ChatView keys it by surface id, so several peer threads
 * can stay open as tabs beside Files/Agents/Preview.
 */
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useMemo } from "react";
import { useProject, useThread } from "~/state/entities";
import { ThreadChatView } from "~/t3team/chat/t3team-ThreadChatView";

export function T3TeamThreadRightPanelSurface({
  environmentId,
  threadId,
}: {
  environmentId: string;
  threadId: string;
}) {
  const ref = useMemo(
    () => ({ environmentId: EnvironmentId.make(environmentId), threadId: ThreadId.make(threadId) }),
    [environmentId, threadId],
  );
  // `useThread` merges the shell (when one exists) with the independently-fetched thread
  // detail; it does not wait on a shell to resolve. Workflow child threads are `ephemeral`
  // on purpose (they must stay out of the sidebar) and so never get a shell projection at
  // all — a shell-only lookup here would spin on "Loading thread…" forever for those. The
  // detail endpoint serves ephemeral threads fine, so this renders as soon as it arrives.
  const thread = useThread(ref);
  const project = useProject(
    thread === null
      ? null
      : { environmentId: ref.environmentId, projectId: ProjectId.make(thread.projectId) },
  );

  if (thread === null) {
    // Genuinely still loading: neither the shell nor the detail fetch has resolved yet. The
    // tab title falls back to "Thread" in RightPanelTabs (shell-sourced titles only) and this
    // re-renders as soon as either one lands.
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
        Loading thread…
      </div>
    );
  }

  return (
    <ThreadChatView
      threadId={threadId}
      projectId={thread.projectId}
      projectTitle={project?.title ?? thread.projectId}
      {...(project?.source?.provider
        ? { projectSource: { provider: project.source.provider } }
        : {})}
      {...(project?.workspaceRoot ? { projectWorkspaceRoot: project.workspaceRoot } : {})}
      title={thread.title}
      hideHeader
      embeddedMode
    />
  );
}
