import { AlertTriangle } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { cn } from "~/t3team/lib/t3team-utils";
import type { T3TeamUserFacingError } from "./t3team-errorMessage";
import { T3TeamErrorTechnicalDisclosure } from "./t3team-ErrorTechnicalDisclosure";

/**
 * Compact single-line error variant for use next to a field. Headline only;
 * the technical string sits behind a small disclosure toggle that never shifts
 * surrounding layout since it only ever adds flow content below.
 */
export function T3TeamErrorStateInline({
  userFacing,
  showRetry,
  onRetry,
  className,
}: {
  readonly userFacing: T3TeamUserFacingError;
  readonly showRetry: boolean;
  readonly onRetry?: () => void;
  readonly className?: string;
}) {
  return (
    <div role="alert" className={cn("space-y-1 text-xs", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-destructive">
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{userFacing.headline}</span>
        {showRetry ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-auto px-1.5 py-0 text-xs"
            onClick={onRetry}
          >
            Try again
          </Button>
        ) : null}
      </div>
      {userFacing.technical ? (
        <T3TeamErrorTechnicalDisclosure technical={userFacing.technical} compact />
      ) : null}
    </div>
  );
}
