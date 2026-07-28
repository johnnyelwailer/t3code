import type { ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Card } from "~/t3team/components/ui/t3team-card";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import type { CreateProjectStep } from "~/t3team/hooks/t3team-useCreateProject";

export type CreateProjectWizardVariant = "dialog" | "inline";

export function CreateProjectWizardStepTransition({
  step,
  children,
}: {
  step: CreateProjectStep;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden">
      <div
        key={step}
        data-step={step}
        className="flex min-h-0 flex-1 flex-col [view-transition-name:t3team-create-project-step-panel]"
      >
        {children}
      </div>
    </div>
  );
}

export function CreateProjectWizardFrame({
  variant,
  onClose,
  children,
  footer,
  heading,
}: {
  variant: CreateProjectWizardVariant;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Overrides the default step-agnostic title, e.g. to name the project being added. */
  heading?: ReactNode;
}) {
  const content = (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(30rem_10rem_at_top,color-mix(in_srgb,var(--color-sky-400)_18%,transparent),transparent)] opacity-90" />

      <div className="relative flex shrink-0 items-start justify-between gap-3 px-3 pt-3 sm:px-4 sm:pt-4">
        {heading ??
          (variant === "inline" ? (
            <div className="space-y-1 px-1">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                Project setup wizard
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Create your first project
              </h2>
            </div>
          ) : (
            <div />
          ))}

        {variant === "inline" ? (
          <Button variant="ghost" onClick={onClose} className="gap-2 self-start">
            <ArrowLeft className="size-4" />
            Back
          </Button>
        ) : (
          <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close dialog">
            <X className="size-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1" scrollbarGutter>
        {children}
      </ScrollArea>

      {footer}
    </>
  );

  if (variant === "inline") {
    return (
      <div className="relative flex min-h-0 flex-1 items-start justify-center overflow-hidden p-3 sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(44rem_22rem_at_top,color-mix(in_srgb,var(--color-sky-400)_18%,transparent),transparent)] opacity-80" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,color-mix(in_srgb,var(--background)_88%,white)_0%,var(--background)_42%,color-mix(in_srgb,var(--background)_94%,var(--color-amber-100))_100%)] dark:bg-[linear-gradient(140deg,color-mix(in_srgb,var(--background)_92%,black)_0%,var(--background)_42%,color-mix(in_srgb,var(--background)_94%,var(--color-sky-950))_100%)]" />

        {/* Same content-fit-with-cap treatment as the dialog variant below, for the same reason:
            a short step (review, creating) should not carry the tall steps' void along with it. */}
        <Card className="relative flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border-border/70 bg-card/95 shadow-2xl shadow-black/10 sm:max-h-[calc(100dvh-3rem)]">
          {content}
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:items-center sm:p-4">
      {/*
        No fixed height: the card fits its content (a short step like "review" or "creating" no
        longer leaves a void), capped by a max-height so it never grows past the viewport. Tall
        steps ("project" with a long Jira list, "profile" with the card grid) still hit that cap and
        scroll internally via the `ScrollArea` below — `overflow-hidden` plus the scroll area's
        `min-h-0 flex-1` is what makes the cap win over the content instead of pushing the card
        taller than the screen.
      */}
      <Card className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden bg-card/95 sm:max-h-[calc(100dvh-2rem)]">
        {content}
      </Card>
    </div>
  );
}
