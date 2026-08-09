import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3team/components/ui/t3team-surface";
import { cn } from "~/t3team/lib/t3team-utils";
import { toUserFacingError } from "./t3team-errorMessage";
import { T3TeamErrorStateInline } from "./t3team-ErrorStateInline";
import { T3TeamErrorTechnicalDisclosure } from "./t3team-ErrorTechnicalDisclosure";

export type T3TeamErrorStateVariant = "block" | "inline" | "page";

/**
 * The one reusable user-facing error surface for t3team: a plain-language
 * headline up front, technical details only on demand. See
 * `docs/t3team-mvp/41-work-item-detail-redesign.md` ("Errors").
 */
export function T3TeamErrorState({
  error,
  action,
  onRetry,
  variant = "block",
  className,
}: {
  readonly error: unknown;
  readonly action?: string;
  readonly onRetry?: () => void;
  readonly variant?: T3TeamErrorStateVariant;
  readonly className?: string;
}) {
  const userFacing = toUserFacingError(error, action ? { action } : undefined);
  const showRetry = Boolean(onRetry) && userFacing.canRetry;

  if (variant === "inline") {
    return (
      <T3TeamErrorStateInline
        userFacing={userFacing}
        showRetry={showRetry}
        {...(onRetry ? { onRetry } : {})}
        {...(className ? { className } : {})}
      />
    );
  }

  /*
    One line when it fits. An error in a section is an interruption, not a destination: the message,
    the retry and the details toggle belong on the same row, wrapping only when the container is too
    narrow to hold them.

    The retry is `outline`, never the primary fill — a saturated accent button on a danger surface
    fights the surface it sits on, and this is a recovery affordance, not the page's main action.
  */
  const body = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />

      <p className="min-w-0 flex-1 text-xs leading-5 text-foreground">
        <span className="font-medium">{userFacing.headline}</span>
        {userFacing.detail ? (
          <span className="text-muted-foreground"> {userFacing.detail}</span>
        ) : null}
      </p>

      {showRetry ? (
        <Button type="button" size="xs" variant="outline" className="shrink-0" onClick={onRetry}>
          <RotateCw className="size-3.5" />
          Try again
        </Button>
      ) : null}

      {/*
        `basis-full` puts the disclosure on its own line of the same wrapping row, so its expanded
        output gets the full width. Nested in the trailing cluster it inherited that cluster's narrow
        column and the stack trace rendered as a cramped second column beside the message.
      */}
      {userFacing.technical ? (
        <div className="basis-full">
          <T3TeamErrorTechnicalDisclosure technical={userFacing.technical} compact />
        </div>
      ) : null}
    </div>
  );

  if (variant === "page") {
    return (
      <div
        role="alert"
        className={cn("flex min-h-40 items-center justify-center py-10", className)}
      >
        <T3SurfaceCard tone="danger" className="w-full max-w-md">
          {/* Tighter than the default card padding — this is a strip in a section, not a panel. */}
      <T3SurfaceCardContent className="p-2.5">{body}</T3SurfaceCardContent>
        </T3SurfaceCard>
      </div>
    );
  }

  return (
    <T3SurfaceCard role="alert" tone="danger" className={className}>
      {/* Tighter than the default card padding — this is a strip in a section, not a panel. */}
      <T3SurfaceCardContent className="p-2.5">{body}</T3SurfaceCardContent>
    </T3SurfaceCard>
  );
}
