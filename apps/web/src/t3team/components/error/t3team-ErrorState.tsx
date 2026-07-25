import { AlertTriangle } from "lucide-react";

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

  const body = (
    <div className="flex items-start gap-2.5">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium text-foreground">{userFacing.headline}</p>
        {userFacing.detail ? (
          <p className="whitespace-pre-line text-xs text-muted-foreground">{userFacing.detail}</p>
        ) : null}
        {showRetry ? (
          <Button type="button" size="xs" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        {userFacing.technical ? (
          <T3TeamErrorTechnicalDisclosure technical={userFacing.technical} />
        ) : null}
      </div>
    </div>
  );

  if (variant === "page") {
    return (
      <div
        role="alert"
        className={cn("flex min-h-40 items-center justify-center py-10", className)}
      >
        <T3SurfaceCard tone="danger" className="w-full max-w-md">
          <T3SurfaceCardContent>{body}</T3SurfaceCardContent>
        </T3SurfaceCard>
      </div>
    );
  }

  return (
    <T3SurfaceCard role="alert" tone="danger" className={className}>
      <T3SurfaceCardContent>{body}</T3SurfaceCardContent>
    </T3SurfaceCard>
  );
}
