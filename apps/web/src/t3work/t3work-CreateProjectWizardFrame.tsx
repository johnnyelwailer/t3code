import type { ReactNode } from "react";
import { ArrowLeft, Loader2, X } from "lucide-react";

import { Button } from "~/t3work/components/ui/t3work-button";
import { Card } from "~/t3work/components/ui/t3work-card";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import type { CreateProjectStep } from "~/t3work/hooks/t3work-useCreateProject";

export type CreateProjectWizardVariant = "dialog" | "inline";

export function CreateProjectWizardStepTransition({
  step,
  children,
}: {
  step: CreateProjectStep;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-hidden">
      <div
        key={step}
        data-step={step}
        className="[view-transition-name:t3work-create-project-step-panel]"
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
}: {
  variant: CreateProjectWizardVariant;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const content = (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(30rem_10rem_at_top,color-mix(in_srgb,var(--color-sky-400)_18%,transparent),transparent)] opacity-90" />

      <div className="relative flex shrink-0 items-start justify-between gap-3 px-3 pt-3 sm:px-4 sm:pt-4">
        {variant === "inline" ? (
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
        )}

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

        <Card className="relative flex h-[min(48rem,calc(100dvh-1.5rem))] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border-border/70 bg-card/95 shadow-2xl shadow-black/10 sm:h-[min(48rem,calc(100dvh-3rem))]">
          {content}
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-2 sm:items-center sm:p-4">
      <Card className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden bg-card/95 sm:h-[min(40rem,calc(100dvh-2rem))]">
        {content}
      </Card>
    </div>
  );
}

export function CreateProjectWizardFooter({
  step,
  canConnectBasic,
  canContinueAccount,
  canContinueProject,
  canCreateProject,
  loadingSource,
  loadingProjects,
  oauthLoading,
  onConnectBasic,
  onConnectOAuth,
  onBack,
  onContinueAccount,
  onContinueProject,
  onCreateProject,
}: {
  step: CreateProjectStep;
  canConnectBasic?: boolean;
  canContinueAccount: boolean;
  canContinueProject: boolean;
  canCreateProject: boolean;
  loadingSource?: boolean;
  loadingProjects: boolean;
  oauthLoading?: boolean;
  onConnectBasic?: () => void;
  onConnectOAuth?: () => void;
  onBack: () => void;
  onContinueAccount: () => void;
  onContinueProject: () => void;
  onCreateProject: () => void;
}) {
  if (step === "creating") {
    return null;
  }

  return (
    <footer className="shrink-0 border-t border-border bg-card px-4 py-3">
      {step === "source" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            className="w-full justify-center gap-2 sm:w-auto"
            variant="outline"
            onClick={onConnectOAuth}
            disabled={loadingSource || oauthLoading || !onConnectOAuth}
          >
            {oauthLoading ? <Loader2 className="size-4 animate-spin" /> : null}
            Connect with OAuth
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={onConnectBasic}
            disabled={loadingSource || !canConnectBasic || !onConnectBasic}
          >
            Connect with API token
          </Button>
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button className="w-full sm:w-auto" variant="outline" onClick={onBack}>
            Back
          </Button>
          {step === "account" ? (
            <Button
              className="w-full justify-center gap-2 sm:min-w-[11rem] sm:w-auto"
              onClick={onContinueAccount}
              disabled={!canContinueAccount || loadingProjects}
            >
              {loadingProjects ? <Loader2 className="size-4 animate-spin" /> : null}
              Continue
            </Button>
          ) : null}
          {step === "project" ? (
            <Button
              className="w-full sm:w-auto"
              onClick={onContinueProject}
              disabled={!canContinueProject}
            >
              Continue
            </Button>
          ) : null}
          {step === "confirm" ? (
            <Button
              className="w-full sm:w-auto"
              onClick={onCreateProject}
              disabled={!canCreateProject}
            >
              Add project
            </Button>
          ) : null}
        </div>
      )}
    </footer>
  );
}
