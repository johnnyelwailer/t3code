import { ArrowUpRightIcon } from "lucide-react";
import type { ProjectSource } from "@t3tools/project-context";
import { Button } from "~/t3team/components/ui/t3team-button";
import { ThreadChatView } from "~/t3team/chat/t3team-ThreadChatView";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";
import type { ProjectThread } from "~/t3team/t3team-types";

type EmbeddedThreadAsideProps = {
  thread: ProjectThread;
  projectId: string;
  projectTitle: string;
  projectSource?: Pick<ProjectSource, "provider">;
  projectWorkspaceRoot?: string;
  ticketId?: string;
  onThreadKickoffConsumed: (threadId: string) => void;
  onOpenFullThread?: () => void;
};

export function EmbeddedThreadAside({
  thread,
  projectId,
  projectTitle,
  projectSource,
  projectWorkspaceRoot,
  ticketId,
  onThreadKickoffConsumed,
  onOpenFullThread,
}: EmbeddedThreadAsideProps) {
  return (
    <aside className="relative flex h-full min-h-0 flex-col overflow-hidden border-l border-border/70 bg-background [view-transition-name:t3team-right-sidebar-panel]">
      <div className="flex min-h-0 flex-1 flex-col pt-10">
        {onOpenFullThread ? (
          <div className="px-3 pb-2">
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground/80"
              onClick={() => runT3TeamViewTransition(() => onOpenFullThread())}
            >
              <ArrowUpRightIcon className="size-3.5" />
              Open full thread
            </Button>
          </div>
        ) : null}
        <ThreadChatView
          threadId={thread.id}
          projectId={projectId}
          projectTitle={projectTitle}
          {...(projectSource ? { projectSource } : {})}
          {...(projectWorkspaceRoot ? { projectWorkspaceRoot } : {})}
          title={thread.title}
          {...(thread.kickoffMessage ? { kickoffMessage: thread.kickoffMessage } : {})}
          {...(thread.kickoffPending !== undefined
            ? { kickoffPending: thread.kickoffPending }
            : {})}
          {...(thread.kickoffWorkflow ? { kickoffWorkflow: thread.kickoffWorkflow } : {})}
          {...(thread.kickoffPending && thread.kickoffMessage
            ? { initialUserMessage: thread.kickoffMessage }
            : {})}
          {...(thread.kickoffModelSelection
            ? { initialModelSelection: thread.kickoffModelSelection }
            : {})}
          {...(thread.kickoffRuntimeMode ? { initialRuntimeMode: thread.kickoffRuntimeMode } : {})}
          {...(thread.kickoffInteractionMode
            ? { initialInteractionMode: thread.kickoffInteractionMode }
            : {})}
          {...(thread.selectedToolIds !== undefined
            ? { selectedToolIds: thread.selectedToolIds }
            : {})}
          {...((ticketId ?? thread.ticketId) ? { ticketId: ticketId ?? thread.ticketId } : {})}
          {...(thread.ticketDisplayId ? { ticketDisplayId: thread.ticketDisplayId } : {})}
          embeddedMode
          onInitialUserMessageSent={() => onThreadKickoffConsumed(thread.id)}
        />
      </div>
    </aside>
  );
}
