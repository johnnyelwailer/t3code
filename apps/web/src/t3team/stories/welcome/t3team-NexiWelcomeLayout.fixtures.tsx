import type { ReactNode } from "react";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { T3TeamNexploreStripArt } from "~/t3team/t3team-NexploreStageArt";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";

/** Left label + content band — mirrors upstream WelcomePage section chrome. */
export function WelcomeSection({
  title,
  children,
  recommended,
  optional,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly recommended?: boolean;
  readonly optional?: boolean;
}) {
  return (
    <section className="grid gap-x-10 border-b border-border/60 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <div className="space-y-1 pt-2">
        <h2 className="text-sm leading-5 text-muted-foreground">{title}</h2>
        {recommended ? (
          <p className="text-3xs font-medium tracking-wide text-foreground/70 uppercase">
            Recommended
          </p>
        ) : null}
        {optional ? <p className="text-3xs text-muted-foreground">Optional</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Shared icon column so agent / account / cloud rows line up. */
export function RowIcon({ children }: { readonly children: ReactNode }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
      {children}
    </span>
  );
}

export function WelcomeRow({
  icon,
  children,
  trailing,
}: {
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <RowIcon>{icon ?? <span className="size-2 rounded-full bg-border" />}</RowIcon>
      <div className="min-w-0 flex-1">{children}</div>
      {trailing ? <div className="shrink-0 self-center">{trailing}</div> : null}
    </div>
  );
}

export function BrandHeader({ productName = "Nexi Work" }: { readonly productName?: string }) {
  return (
    <header className="relative mb-8 overflow-hidden rounded-2xl border border-border/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 overflow-hidden opacity-90">
        <T3TeamNexploreStripArt />
      </div>
      <div className="relative flex flex-col gap-2 px-5 pt-14 pb-5 sm:px-6">
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-3xs font-medium text-foreground/80 shadow-sm backdrop-blur-sm">
          <SparklesIcon className="size-3 text-info" />
          First-run setup
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Welcome to {productName}
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Sign in, confirm an agent, connect your work sources, then start. Everything except one
          ready agent is optional.
        </p>
      </div>
    </header>
  );
}

export function WelcomePageShell({
  children,
  narrow,
}: {
  readonly children: ReactNode;
  readonly narrow?: boolean;
}) {
  return (
    <div
      className="relative min-h-screen overflow-y-auto bg-background text-foreground"
      data-welcome-mockup=""
      style={narrow ? { width: 390, marginInline: "auto" } : undefined}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-52 t3team-welcome-glow opacity-70" />
      <div className="pointer-events-none absolute inset-0 t3team-welcome-wash" />
      <div
        className={`relative mx-auto flex min-h-screen w-full flex-col px-5 pt-10 pb-10 sm:px-6 sm:pt-14 ${
          narrow ? "max-w-[390px]" : "max-w-3xl"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function MoreInSettingsLine() {
  return (
    <p className="mt-6 text-xs text-muted-foreground">More in Settings → Features (voice, Labs).</p>
  );
}

export function StartFooter({
  agentReady,
  onStart,
  onStartWithoutAgent,
}: {
  readonly agentReady: boolean;
  readonly onStart?: () => void;
  readonly onStartWithoutAgent?: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      {agentReady ? (
        <span />
      ) : (
        <Button variant="ghost-muted" onClick={onStartWithoutAgent}>
          Start without an agent
        </Button>
      )}
      <div className="flex items-center gap-3">
        {agentReady ? null : (
          <span className="text-xs text-muted-foreground">Set up one agent to start.</span>
        )}
        <Button disabled={!agentReady} onClick={onStart}>
          Start
        </Button>
      </div>
    </div>
  );
}

export function AddMoreAgents({
  open,
  children,
  emptyLabel = "Add more agents",
}: {
  readonly open?: boolean;
  readonly children: ReactNode;
  readonly emptyLabel?: string;
}) {
  return (
    <Collapsible defaultOpen={open}>
      <CollapsibleTrigger className="mt-2 flex w-full items-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground">
        <ChevronDownIcon className="size-4" />
        {emptyLabel}
      </CollapsibleTrigger>
      <CollapsiblePanel className="space-y-2 pt-1 pb-2">{children}</CollapsiblePanel>
    </Collapsible>
  );
}

export function SkippedNote({ children }: { readonly children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function LockedNote({ children }: { readonly children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
