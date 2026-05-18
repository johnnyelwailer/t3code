import { useState } from "react";
import { Card, CardContent } from "~/t3work/components/ui/t3work-card";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import type { ProjectThread } from "~/t3work/t3work-types";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { formatRelativeTime } from "./t3work-AppTicketHelpers";

type TicketKickoffPanelProps = {
  displayId: string;
  issueThreads: ProjectThread[];
  onOpenThread: (threadId: string) => void;
  onKickoff: (
    instruction: string,
    selection: ModelSelection,
    runtimeMode: RuntimeMode,
    interactionMode: ProviderInteractionMode,
  ) => void;
  renderComposer: (props: {
    prefillText?: string;
    onSubmit: (
      text: string,
      selection: ModelSelection,
      runtimeMode: RuntimeMode,
      interactionMode: ProviderInteractionMode,
    ) => void;
  }) => React.ReactNode;
};

export function TicketKickoffPanel({
  displayId,
  issueThreads,
  onOpenThread,
  onKickoff,
  renderComposer,
}: TicketKickoffPanelProps) {
  const [prefill, setPrefill] = useState<string | undefined>(undefined);

  const recipeButtons = [
    {
      id: "summarize",
      title: "Understand the request",
      description: "Get a plain-language summary and highlight anything unclear.",
      prompt: "Summarize this ticket and list unknowns or ambiguities.",
    },
    {
      id: "implement",
      title: "Plan the work",
      description: "Break this into clear implementation steps with a safe rollout order.",
      prompt: "Propose a concrete implementation plan with impacted areas and rollout order.",
    },
    {
      id: "test",
      title: "Prepare testing",
      description: "Create practical QA and regression checks before shipping.",
      prompt: "Create a comprehensive QA and regression test plan for this ticket.",
    },
    {
      id: "comment",
      title: "Write a Jira update",
      description: "Draft a clear status comment you can quickly review and post.",
      prompt: "Draft a concise Jira update comment with current assumptions and next steps.",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h3 className="text-base font-semibold">Get Help With {displayId}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Start a new conversation with all ticket context included automatically.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4 sm:p-5">
          <section className="space-y-3">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Quick starts
            </h4>
            <div className="space-y-2.5">
              {recipeButtons.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  className="w-full rounded-md border border-border/70 bg-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/30"
                  onClick={() => setPrefill(recipe.prompt)}
                >
                  <div className="text-sm font-medium text-foreground/90">{recipe.title}</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground/80">
                    {recipe.description}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2.5 pb-1">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Conversations
            </h4>
            {issueThreads.length === 0 && (
              <p className="px-1 py-1 text-xs text-muted-foreground/70">
                No conversations started for this ticket yet.
              </p>
            )}
            {issueThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="block w-full text-left"
                onClick={() => onOpenThread(thread.id)}
              >
                <Card className="border-border/70 bg-transparent transition-colors hover:bg-accent/35">
                  <CardContent className="p-3.5">
                    <div className="truncate text-sm font-medium">{thread.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {thread.messageCount} messages • {formatRelativeTime(thread.lastMessageAt)}
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </section>
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border bg-background/75 p-3 sm:p-4">
        {renderComposer({
          ...(prefill ? { prefillText: prefill } : {}),
          onSubmit: (text, selection, runtimeMode, interactionMode) => {
            onKickoff(text, selection, runtimeMode, interactionMode);
            setPrefill(undefined);
          },
        })}
      </div>
    </div>
  );
}
