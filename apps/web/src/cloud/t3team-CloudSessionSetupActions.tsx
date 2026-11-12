/**
 * The setup card's one primary action and overflow, with an immediate pending label.
 * GitHub Sign in is primary when offered; the dialog opens only from that click.
 */
import { RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { CloudSessionSetupCardProps } from "./t3team-CloudSessionSetupCard";
import {
  CloudSetupOverflowMenu,
  type CloudSetupOverflowItem,
} from "./t3team-CloudSetupOverflowMenu";
import {
  optimisticActionLabel,
  useCloudSessionOptimisticAction,
} from "./t3team-cloudSessionOptimisticAction";
import {
  acceptCloudSessionSignInOffer,
  useCloudSessionSignInStore,
} from "./t3team-cloudSessionSignIn";

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
  const optimistic = useCloudSessionOptimisticAction();
  const offer = useCloudSessionSignInStore((state) => state.offer);
  const tryAgain = (failed || stalled) && onTryAgain ? onTryAgain : null;
  const cancelLabel = sending === true ? "Sending…" : "Cancel message";
  const cancelIsPrimary = !onRetry && tryAgain === null && onCancel !== undefined && offer === null;
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
  if (offer === null && primary === null && !cancelIsPrimary && items.length === 0) return null;
  const signInLabel = offer?.host === undefined ? "Sign in to GitHub" : `Sign in to ${offer.host}`;
  const primaryLabel = onRetry ? "Retry" : "Try again";
  const pendingLabel = onRetry ? "Retrying…" : "Starting…";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {offer !== null ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          data-cloud-setup-action="primary"
          data-cloud-setup-signin=""
          disabled={optimistic.pending}
          onClick={() =>
            optimistic.run(() => {
              acceptCloudSessionSignInOffer();
            })
          }
        >
          {optimisticActionLabel(optimistic.pending, signInLabel, "Starting…")}
        </Button>
      ) : primary !== null ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          data-cloud-setup-action="primary"
          disabled={optimistic.pending}
          onClick={() => optimistic.run(primary)}
        >
          <RotateCcwIcon aria-hidden />
          {optimisticActionLabel(optimistic.pending, primaryLabel, pendingLabel)}
        </Button>
      ) : null}
      {optimistic.error ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          data-cloud-setup-action="retry-error"
          onClick={() =>
            optimistic.run(() => {
              if (offer !== null) acceptCloudSessionSignInOffer();
              else primary?.();
            })
          }
        >
          Retry
        </Button>
      ) : null}
      {cancelIsPrimary && onCancel ? (
        <Button
          type="button"
          size="xs"
          variant="ghost-muted"
          data-cloud-setup-action="primary"
          disabled={sending || optimistic.pending}
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
