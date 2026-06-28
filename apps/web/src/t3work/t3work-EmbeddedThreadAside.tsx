import { ArrowUpRightIcon } from "lucide-react";
import { Button } from "~/t3work/components/ui/t3work-button";
import { ThreadChatView } from "~/t3work/chat/t3work-ThreadChatView";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";
import type { ProjectThread } from "~/t3work/t3work-types";

type EmbeddedThreadAsideProps = {
  thread: ProjectThread;
  projectId: string;
  projectTitle: string;
  projectWorkspaceRoot?: string;
  ticketId?: string;
  onThreadKickoffConsumed: (threadId: string) => void;
  onOpenFullThread?: () => void;
};

export function EmbeddedThreadAside({
  thread,
  projectId,
  projectTitle,
  projectWorkspaceRoot,
  ticketId,
  onThreadKickoffConsumed,
  onOpenFullThread,
}: EmbeddedThreadAsideProps) {
  return (
    <aside className="relative flex h-full min-h-0 flex-col overflow-hidden border-l border-border/70 bg-background [view-transition-name:t3work-right-sidebar-panel]">
      <div className="flex min-h-0 flex-1 flex-col pt-10">
        {onOpenFullThread ? (
          <div className="px-3 pb-2">
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground/80"
              onClick={() => runT3workViewTransition(() => onOpenFullThread())}
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
