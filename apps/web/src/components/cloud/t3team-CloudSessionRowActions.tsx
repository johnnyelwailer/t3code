import type { CloudSession } from "@t3tools/contracts";
import { EraserIcon, TrashIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { CloudSessionProvisionPresentation } from "./t3team-cloudSessionProvisionPresentation";

/**
 * The action cluster of one active cloud session row: the secondary verb
 * (Stop, on a ready machine), "Delete" when the surface offers it,
 * "Forget" when the ready machine is saved on this device, and the primary verb
 * (Connect / Cancel / Start another).
 *
 * The panel owns a session's whole lifecycle, so Forget lives here rather than
 * on the machine's saved-backend row. It removes the local saved connection
 * only — the machine keeps running, which is why it is a separate verb from
 * Stop. Delete is the destructive one: it asks once, and its result reports the
 * wip branch any unpushed work was saved to.
 */
export function CloudSessionRowActions({
  session,
  presentation,
  onAction,
  onSecondaryAction,
  onDelete,
  onForget,
  actionPending,
  secondaryActionPending,
  deletePending,
  pendingLabel,
}: {
  readonly session: CloudSession;
  readonly presentation: CloudSessionProvisionPresentation;
  readonly onAction?: ((session: CloudSession) => void) | undefined;
  readonly onSecondaryAction?: ((session: CloudSession) => void) | undefined;
  /** Absent when the stop/delete feature is off; the confirm happens in the handler. */
  readonly onDelete?: ((session: CloudSession) => void) | undefined;
  /** Present only when the ready machine is saved here, so Forget has an effect. */
  readonly onForget?: ((session: CloudSession) => void) | undefined;
  readonly actionPending: boolean;
  readonly secondaryActionPending: boolean;
  readonly deletePending: boolean;
  readonly pendingLabel?: string | null | undefined;
}) {
  const hasSecondary =
    presentation.secondaryActionLabel !== null && onSecondaryAction !== undefined;
  const busy = actionPending || secondaryActionPending || deletePending;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {hasSecondary ? (
        <Button
          size="sm"
          variant="outline"
          disabled={secondaryActionPending || deletePending}
          onClick={() => onSecondaryAction?.(session)}
        >
          {secondaryActionPending ? "Stopping…" : presentation.secondaryActionLabel}
        </Button>
      ) : null}
      {onDelete !== undefined ? (
        <Button
          size="sm"
          variant="destructive-outline"
          disabled={deletePending || busy}
          onClick={() => onDelete(session)}
        >
          <TrashIcon className="size-3.5" />
          {deletePending ? "Deleting…" : "Delete"}
        </Button>
      ) : null}
      {session.phase === "ready" && onForget !== undefined ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Forget this environment"
                disabled={busy}
                onClick={() => onForget(session)}
              >
                <EraserIcon className="size-4" />
              </Button>
            }
          />
          <TooltipPopup side="top">Forget this environment. The machine keeps running</TooltipPopup>
        </Tooltip>
      ) : null}
      {presentation.actionLabel === null ? null : (
        <Button
          size="sm"
          variant={presentation.tone === "ready" ? "default" : "outline"}
          disabled={actionPending}
          onClick={() => onAction?.(session)}
        >
          {actionPending ? (pendingLabel ?? "Working…") : presentation.actionLabel}
        </Button>
      )}
    </div>
  );
}
