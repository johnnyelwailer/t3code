/**
 * The "side chat" right-panel surface: another thread rendered as a standard right-panel tab.
 *
 * A side chat is a `thread:` surface in the right-panel store (see rightPanelStore.ts); this
 * component is its content. It reuses the embedded ThreadChatView the way the legacy `?chatThreadId`
 * split did (hideHeader + embeddedMode). ChatView keys it by surface id, so several peer threads
 * can stay open as tabs beside Files/Preview.
 */
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useMemo } from "react";
import { useProject, useThreadProjection, useThreadShell } from "~/state/entities";
import { readLiveProjectSourceBinding } from "~/t3team/t3team-projectSourceBinding";
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
  // The shell is enough for every listed thread. A thread with no shell yet (a fresh child the
  // shell snapshot has not delivered) falls back to its projection, so the tab renders as soon as
  // either one lands instead of spinning on "Loading thread…".
  const shell = useThreadShell(ref);
  const detail = useThreadProjection(shell === null ? ref : null);
  const thread = shell ?? detail?.projection.thread ?? null;
  const project = useProject(
    thread === null
      ? null
      : { environmentId: ref.environmentId, projectId: ProjectId.make(thread.projectId) },
  );
  const projectSourceProvider =
    project === null ? undefined : readLiveProjectSourceBinding(project)?.provider;

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
      {...(projectSourceProvider ? { projectSource: { provider: projectSourceProvider } } : {})}
      {...(project?.workspaceRoot ? { projectWorkspaceRoot: project.workspaceRoot } : {})}
      title={thread.title}
      hideHeader
      embeddedMode
    />
  );
}
