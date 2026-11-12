/**
 * The setup card's one primary action and its "⋯". Retry leads whenever retrying is possible, a
 * fresh session leads when it is not, and a waiting message keeps Cancel; everything else — the
 * recovery actions, the way out, the provider's run log — sits in the overflow.
 */
import { RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { CloudSessionSetupCardProps } from "./t3team-CloudSessionSetupCard";
import {
  CloudSetupOverflowMenu,
  type CloudSetupOverflowItem,
} from "./t3team-CloudSetupOverflowMenu";

export function SetupActions({
  failed,
  stalled = false,
  detailsUrl,
  onCancel,
  onRetry,
  recoveryActions,
  onTryAgain,
  sending,
}: Pick<
  CloudSessionSetupCardProps,
  "onCancel" | "onRetry" | "recoveryActions" | "onTryAgain" | "sending"
> & {
  readonly failed: boolean;
  /** The session has not shown up yet: no failure, but a fresh session is on offer. */
  readonly stalled?: boolean;
  readonly detailsUrl: string | null;
}) {
  const tryAgain = (failed || stalled) && onTryAgain ? onTryAgain : null;
  const cancelLabel = sending === true ? "Sending…" : "Cancel message";
  const cancelIsPrimary = !onRetry && tryAgain === null && onCancel !== undefined;
  const items: ReadonlyArray<CloudSetupOverflowItem> = [
    ...(onRetry && tryAgain !== null
      ? [{ id: "try-again", label: "Try again", onClick: tryAgain }]
      : []),
    ...(recoveryActions ?? []).map((action) => ({
      id: action.id,
      label: action.label,
      onClick: action.onClick,
    })),
    ...(onCancel && !cancelIsPrimary
      ? [{ id: "cancel", label: cancelLabel, onClick: onCancel, disabled: sending === true }]
      : []),
    ...(failed && detailsUrl !== null
      ? [{ id: "details", label: "See what happened", href: detailsUrl }]
      : []),
  ];
  const primary: (() => void) | null = onRetry ?? tryAgain;
  if (primary === null && !cancelIsPrimary && items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {primary !== null ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          data-cloud-setup-action="primary"
          onClick={primary}
        >
          <RotateCcwIcon aria-hidden />
          {onRetry ? "Retry" : "Try again"}
        </Button>
      ) : null}
      {cancelIsPrimary && onCancel ? (
        <Button
          type="button"
          size="xs"
          variant="ghost-muted"
          data-cloud-setup-action="primary"
          disabled={sending}
          onClick={onCancel}
        >
          <XIcon aria-hidden />
          {cancelLabel}
        </Button>
      ) : null}
      <CloudSetupOverflowMenu items={items} />
    </div>
  );
}
