import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { toUserFacingError } from "~/t3team/components/error/t3team-errorMessage";
import { CalmNotice, type CalmNoticeAction } from "~/t3team/t3team-CalmNotice";

/**
 * `CalmNotice` adapted for a caught error: classifies it through `toUserFacingError` (never a raw
 * error string) and wires the retry button to the classification's own `canRetry`.
 */
export function CalmError({
  error,
  action,
  headline,
  icon,
  onRetry,
  retryLabel = "Try again",
  secondaryAction,
  children,
  compact = false,
  className,
}: {
  readonly error: unknown;
  /** Gerund phrase for the fallback headline when nothing classifies the error, e.g. "adding the project". */
  readonly action?: string | undefined;
  /** Overrides the classified headline, e.g. "Couldn't reach Jira". */
  readonly headline?: string | undefined;
  readonly icon?: LucideIcon;
  readonly onRetry?: (() => void) | undefined;
  readonly retryLabel?: string;
  readonly secondaryAction?: CalmNoticeAction | undefined;
  readonly children?: ReactNode;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const userFacing = toUserFacingError(error, action ? { action } : undefined);
  const primaryAction =
    onRetry && userFacing.canRetry ? { label: retryLabel, onClick: onRetry } : undefined;

  return (
    <CalmNotice
      {...(icon ? { icon } : {})}
      headline={headline ?? userFacing.headline}
      {...(userFacing.detail ? { detail: userFacing.detail } : {})}
      {...(userFacing.technical ? { details: userFacing.technical } : {})}
      {...(primaryAction ? { primaryAction } : {})}
      {...(secondaryAction ? { secondaryAction } : {})}
      compact={compact}
      {...(className ? { className } : {})}
    >
      {children}
    </CalmNotice>
  );
}
