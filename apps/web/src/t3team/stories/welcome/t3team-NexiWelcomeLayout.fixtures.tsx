import type { ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, CircleDashedIcon, LockIcon } from "lucide-react";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Button } from "~/t3team/components/ui/t3team-button";

/** Shared mark tile — same size/placement for Nexplore, Jira, GitHub, agents. */
export function ServiceMark({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <span
      aria-label={label}
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
    >
      <span className="flex size-5 items-center justify-center [&_svg]:size-5">{children}</span>
    </span>
  );
}

export type WelcomeStatus = "ready" | "connected" | "pending" | "locked" | "skipped" | "action";

export function StatusLabel({
  status,
  label,
}: {
  readonly status: WelcomeStatus;
  readonly label: string;
}) {
  if (status === "ready" || status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CheckIcon className="size-3.5 text-foreground/70" aria-hidden />
        {label}
      </span>
    );
  }
  if (status === "locked") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <LockIcon className="size-3.5" aria-hidden />
        {label}
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CircleDashedIcon className="size-3.5" aria-hidden />
        {label}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

/** mark | name | optional act-needed detail | status | one action */
export function WelcomeItem({
  mark,
  title,
  description,
  status,
  action,
}: {
  readonly mark: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  readonly status?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {mark}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <div className="text-xs leading-5 text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {status ? <div className="hidden shrink-0 sm:block">{status}</div> : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Left section label only — no Recommended / Optional tags. */
export function WelcomeSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid items-start gap-x-8 border-b border-border/50 py-4 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
      <h2 className="pt-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="min-w-0 divide-y divide-border/40">{children}</div>
    </section>
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
      <div
        className={`relative mx-auto flex min-h-screen w-full flex-col px-5 pt-8 pb-12 sm:px-6 sm:pt-10 ${
          narrow ? "max-w-[390px]" : "max-w-3xl"
        }`}
      >
        {children}
      </div>
    </div>
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
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-5">
      {agentReady ? (
        <span />
      ) : (
        <Button variant="ghost-muted" size="sm" onClick={onStartWithoutAgent}>
          Start without an agent
        </Button>
      )}
      <Button size="sm" disabled={!agentReady} onClick={onStart}>
        Start
      </Button>
    </div>
  );
}

export function ShowMore({
  open,
  label,
  children,
}: {
  readonly open?: boolean;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={open}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDownIcon className="size-3.5" />
        {label}
      </CollapsibleTrigger>
      <CollapsiblePanel className="divide-y divide-border/40 pb-1">{children}</CollapsiblePanel>
    </Collapsible>
  );
}

export function PrimaryAction({
  children,
  onClick,
  disabled,
}: {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Button size="sm" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

export function SecondaryAction({
  children,
  onClick,
  disabled,
}: {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}
