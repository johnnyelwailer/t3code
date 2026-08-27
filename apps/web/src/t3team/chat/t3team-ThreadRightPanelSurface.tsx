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
import { useProject, useThreadShell } from "~/state/entities";
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
  const shell = useThreadShell(ref);
  const project = useProject(
    shell === null
      ? null
      : { environmentId: ref.environmentId, projectId: ProjectId.make(shell.projectId) },
  );

  if (shell === null) {
    // A peer thread can be opened before its shell projection arrives; the tab title falls back
    // to "Thread" in RightPanelTabs and this re-renders as soon as the shell lands.
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
        Loading thread…
      </div>
    );
  }

  return (
    <ThreadChatView
      threadId={threadId}
      projectId={shell.projectId}
      projectTitle={project?.title ?? shell.projectId}
      {...(project?.source?.provider
        ? { projectSource: { provider: project.source.provider } }
        : {})}
      {...(project?.workspaceRoot ? { projectWorkspaceRoot: project.workspaceRoot } : {})}
      title={shell.title}
      hideHeader
      embeddedMode
    />
  );
}
