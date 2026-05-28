import { CheckCircle2Icon, LoaderCircleIcon, WandSparklesIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

type ThreadKickoffPlaceholderProps = {
  message: string;
  kickoffPending?: boolean;
  workflow?: T3workKickoffWorkflow;
  hasServerThread?: boolean;
};

export function shouldShowThreadKickoffPlaceholder(input: {
  kickoffMessage: string | undefined;
  serverMessageCount: number | null;
  hasServerLaunchActivity?: boolean;
}): boolean {
  if (!input.kickoffMessage?.trim()) {
    return false;
  }

  if (input.hasServerLaunchActivity) {
    return false;
  }

  return (input.serverMessageCount ?? 0) === 0;
}

export function isWaitingForKickoffInput(
  workflow: T3workKickoffWorkflow | undefined,
  kickoffPending: boolean | undefined,
): boolean {
  return (
    workflow?.kind === "recipe" &&
    kickoffPending !== true &&
    (workflow.kickoff?.steps.some((step) => step.kind === "wait-for-kickoff-input") ?? false)
  );
}

function renderRecipeWorkflowCard(input: {
  message: string;
  kickoffPending: boolean | undefined;
  workflow: T3workKickoffWorkflow;
  hasServerThread: boolean;
}) {
  const isRecipeAuthoringIntro = isWaitingForKickoffInput(input.workflow, input.kickoffPending);
  const steps: ReadonlyArray<{
    readonly label: string;
    readonly complete?: boolean;
    readonly active?: boolean;
  }> = isRecipeAuthoringIntro
    ? [
        {
          label: "Recipe selected",
          complete: true,
        },
        {
          label: input.hasServerThread ? "Conversation created" : "Creating conversation",
          complete: input.hasServerThread,
          active: !input.hasServerThread,
        },
        {
          label: input.hasServerThread
            ? "Waiting for your recipe prompt"
            : "Waiting for live thread",
          active: input.hasServerThread,
        },
      ]
    : [
        {
          label: "Recipe selected",
          complete: true,
        },
        {
          label: input.hasServerThread ? "Conversation created" : "Creating conversation",
          complete: input.hasServerThread,
          active: !input.hasServerThread,
        },
        {
          label: input.hasServerThread ? "Handing recipe to agent" : "Waiting for live thread",
          active: input.hasServerThread,
        },
      ];

  return (
    <div className="mt-2 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <WandSparklesIcon className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">{input.workflow.title}</p>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{input.workflow.description}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">
            {input.workflow.source === "project-local" ? "Project recipe" : "Bundled recipe"}
          </Badge>
          {input.workflow.reason ? <Badge variant="outline">{input.workflow.reason}</Badge> : null}
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-sm text-muted-foreground">
            {step.complete === true ? (
              <CheckCircle2Icon className="size-4 text-emerald-600" />
            ) : step.active === true ? (
              <LoaderCircleIcon className="size-4 animate-spin text-primary" />
            ) : (
              <div className="size-4 rounded-full border border-border/70" />
            )}
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Launch instruction
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
          {input.message}
        </p>
      </div>
    </div>
  );
}

export function ThreadKickoffPlaceholder({
  message,
  kickoffPending,
  workflow,
  hasServerThread = false,
}: ThreadKickoffPlaceholderProps) {
  return (
    <div className="border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Kickoff queued locally
        </p>
        {workflow?.kind === "recipe" ? (
          renderRecipeWorkflowCard({ message, kickoffPending, workflow, hasServerThread })
        ) : (
          <div className="mt-2 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm">
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message}</p>
          </div>
        )}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Showing the local kickoff prompt until the live thread picks up the durable launch state.
        </p>
      </div>
    </div>
  );
}
