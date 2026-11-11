"use client";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

/**
 * The card's two action rows: the one that starts a flow, and the one that reports a flow that
 * ended badly. Split from `ToolAuthCard` so the card stays a phase switch — these two carry the
 * pending and error affordances that make every click visible.
 *
 * @module components/settings/ToolAuthCardActions
 */

export interface ToolAuthActionRowProps {
  readonly description: string;
  readonly actionLabel: string;
  /** Replaces the button with a spinner and the label below, so no click looks ignored. */
  readonly pending: boolean;
  readonly pendingLabel: string;
  readonly onAction: () => void;
}

export function ToolAuthActionRow({
  description,
  actionLabel,
  pending,
  pendingLabel,
  onAction,
}: ToolAuthActionRowProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground/80">{description}</p>
      {pending ? (
        <div
          data-testid="toolauth-pending"
          className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"
          role="status"
        >
          <Spinner className="size-3.5" />
          {pendingLabel}
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          data-testid="toolauth-primary-action"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export interface ToolAuthFailureRowProps {
  /** Already-mapped plain words: what happened, on which machine, and the next step. */
  readonly text: string;
  readonly retryLabel: string;
  readonly pending: boolean;
  readonly pendingLabel: string;
  readonly onRetry: () => void;
}

export function ToolAuthFailureRow({
  text,
  retryLabel,
  pending,
  pendingLabel,
  onRetry,
}: ToolAuthFailureRowProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p data-testid="toolauth-error" className="text-xs text-destructive">
        {text}
      </p>
      {pending ? (
        <div
          data-testid="toolauth-pending"
          className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"
          role="status"
        >
          <Spinner className="size-3.5" />
          {pendingLabel}
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          data-testid="toolauth-retry"
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
