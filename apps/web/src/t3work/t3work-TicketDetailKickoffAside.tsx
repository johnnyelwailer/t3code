import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";
import { TicketKickoffComposer } from "~/t3work/t3work-TicketKickoffComposer";
import { TicketKickoffPanel } from "~/t3work/t3work-TicketKickoffPanel";
import type { ProjectThread } from "~/t3work/t3work-types";

export function TicketDetailKickoffAside({
  displayId,
  issueThreads,
  projectId,
  ticketId,
  kickoffContext,
  providers,
  isConnected,
  onOpenThread,
  onKickoffThread,
}: {
  displayId: string;
  issueThreads: ProjectThread[];
  projectId: string;
  ticketId: string;
  kickoffContext: string;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenThread: (projectId: string, threadId: string) => void;
  onKickoffThread: (input: {
    projectId: string;
    ticketId: string;
    ticketDisplayId: string;
    kickoffMessage: string;
    kickoffModelSelection: ModelSelection;
    kickoffRuntimeMode: RuntimeMode;
    kickoffInteractionMode: ProviderInteractionMode;
  }) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-l border-border/70">
      <TicketKickoffPanel
        displayId={displayId}
        issueThreads={issueThreads}
        onOpenThread={(threadId) => onOpenThread(projectId, threadId)}
        onKickoff={(
          instruction,
          kickoffModelSelection,
          kickoffRuntimeMode,
          kickoffInteractionMode,
        ) => {
          onKickoffThread({
            projectId,
            ticketId,
            ticketDisplayId: displayId,
            kickoffMessage: `${kickoffContext}\n\nTask:\n${instruction}`,
            kickoffModelSelection,
            kickoffRuntimeMode,
            kickoffInteractionMode,
          });
        }}
        renderComposer={({ prefillText, onSubmit }) => (
          <TicketKickoffComposer
            {...(prefillText ? { prefillText } : {})}
            providers={providers}
            isConnected={isConnected}
            onSubmit={onSubmit}
          />
        )}
      />
    </aside>
  );
}
