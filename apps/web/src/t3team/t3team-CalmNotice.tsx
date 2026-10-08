import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { T3TeamErrorTechnicalDisclosure } from "~/t3team/components/error/t3team-ErrorTechnicalDisclosure";
import { Button } from "~/t3team/components/ui/t3team-button";
import { cn } from "~/t3team/lib/t3team-utils";

export type CalmNoticeAction = {
  readonly label: string;
  readonly onClick: () => void;
};

/**
 * The one calm (non-danger) notice surface: an icon in a muted circle, a plain headline, an
 * optional detail line, and up to one primary and one secondary action. Warning tone is carried
 * only by the icon — the text stays neutral, this is a state to act on, not an alarm.
 *
 * `compact` renders as a single wrapping row instead of a centered block, for a notice that has
 * to sit inline among other rows (a picker's empty state, a footer).
 */
export function CalmNotice({
  icon: Icon = AlertTriangle,
  headline,
  detail,
  details,
  detailsLabel = "Details",
  primaryAction,
  secondaryAction,
  children,
  compact = false,
  className,
}: {
  readonly icon?: LucideIcon;
  readonly headline: string;
  readonly detail?: string | undefined;
  /** Collapsed behind a "Details" disclosure, never shown by default. */
  readonly details?: string | undefined;
  readonly detailsLabel?: string;
  readonly primaryAction?: CalmNoticeAction | undefined;
  readonly secondaryAction?: CalmNoticeAction | undefined;
  /** Extra content between the detail line and the actions, e.g. a copyable command. */
  readonly children?: ReactNode;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  if (compact) {
    return (
      <div role="status" className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
        <Icon className="size-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs leading-5 text-foreground">
          <span className="font-medium">{headline}</span>
          {detail ? <span className="text-muted-foreground"> {detail}</span> : null}
        </p>
        {primaryAction ? (
          <Button type="button" size="xs" variant="outline" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        ) : null}
        {secondaryAction ? (
          <Button type="button" size="xs" variant="ghost" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        ) : null}
        {children ? <div className="basis-full">{children}</div> : null}
        {details ? (
          <div className="basis-full">
            <T3TeamErrorTechnicalDisclosure technical={details} label={detailsLabel} compact />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="status"
      className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-warning" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{headline}</p>
        {detail ? <p className="max-w-sm text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      {children}
      {primaryAction || secondaryAction ? (
        <div className="flex items-center gap-2">
          {primaryAction ? (
            <Button type="button" size="sm" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button type="button" size="sm" variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
      {details ? (
        <T3TeamErrorTechnicalDisclosure technical={details} label={detailsLabel} compact />
      ) : null}
    </div>
  );
}
