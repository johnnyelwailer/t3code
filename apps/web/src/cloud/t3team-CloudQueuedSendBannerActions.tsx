/**
 * The composer banner's actions for a queued cloud send: one primary button and a "⋯", the same
 * shape as the setup card's, so the two surfaces never offer the same message a different row of
 * equally loud buttons.
 */
import { Button } from "~/components/ui/button";
import type { CloudQueuedSendRecoveryAction } from "./t3team-cloudProjectNotResolvedActions";
import {
  CloudSetupOverflowMenu,
  type CloudSetupOverflowItem,
} from "./t3team-CloudSetupOverflowMenu";

export function CloudQueuedSendBannerActions({
  onRetry,
  recoveryActions,
  onCancel,
  flushing,
}: {
  /** Retry a parked send, or start a long wait over; null when neither applies. */
  readonly onRetry: (() => void) | null;
  readonly recoveryActions: ReadonlyArray<CloudQueuedSendRecoveryAction>;
  readonly onCancel: () => void;
  readonly flushing: boolean;
}) {
  const cancelIsPrimary = !flushing && onRetry === null;
  const items: ReadonlyArray<CloudSetupOverflowItem> = [
    ...recoveryActions.map((action) => ({
      id: action.id,
      label: action.label,
      onClick: action.onClick,
    })),
    ...(cancelIsPrimary || flushing ? [] : [{ id: "cancel", label: "Cancel", onClick: onCancel }]),
  ];
  return (
    <>
      {flushing ? (
        // In flight the turn is already starting: it is delivered, not cancellable.
        <Button size="xs" variant="ghost" disabled>
          Sending…
        </Button>
      ) : (
        <Button
          size="xs"
          variant="ghost"
          onClick={onRetry ?? onCancel}
          data-cloud-queued-send-action="primary"
        >
          {onRetry === null ? "Cancel" : "Retry"}
        </Button>
      )}
      <CloudSetupOverflowMenu items={items} />
    </>
  );
}
