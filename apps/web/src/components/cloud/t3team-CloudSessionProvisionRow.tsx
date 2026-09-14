import type { CloudSession } from "@t3tools/contracts";
import { useCallback } from "react";

import { cn } from "~/lib/utils";
import { ConnectionStatusDot } from "../ConnectionStatusDot";
import { ITEM_ROW_CLASSNAME, ITEM_ROW_INNER_CLASSNAME } from "../settings/itemRows";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import {
  cloudSessionToneDotClassName,
  cloudSessionTonePingClassName,
  presentCloudSession,
} from "./t3team-cloudSessionProvisionPresentation";

/**
 * One provisioning session rendered as a list row, plus the skeleton rows the
 * panel shows while the first list loads.
 *
 * Owns everything per-row: the status dot, the wording (via the
 * presentation module), the determinate progress bar, and the row's primary
 * action. The panel composes these rows; it adds nothing per-session itself.
 */

/**
 * A determinate bar for a session that is still provisioning. Deliberately not
 * a spinner: the timings are predictable enough (~2.5 min) that an indeterminate
 * spinner would understate how much is known.
 */
function CloudSessionProgressBar({ progress }: { readonly progress: number }) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div
        className="h-full rounded-full bg-warning transition-[width] duration-500 ease-out"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

export function CloudSessionRowsSkeleton() {
  return (
    <div className={ITEM_ROW_CLASSNAME}>
      <div className={ITEM_ROW_INNER_CLASSNAME}>
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-40 rounded-full" />
          <Skeleton className="h-3 w-56 rounded-full" />
        </div>
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>
    </div>
  );
}

/**
 * One provisioning attempt. The row never names the provider's concepts — no
 * run ids, no job names — because the user asked for a workspace, not a build.
 */
export function CloudSessionRow({
  session,
  onAction,
  actionPending = false,
}: {
  readonly session: CloudSession;
  readonly onAction: (session: CloudSession) => void;
  readonly actionPending?: boolean;
}) {
  const presentation = presentCloudSession(session);
  const handleAction = useCallback(() => {
    onAction(session);
  }, [onAction, session]);

  return (
    <div className={ITEM_ROW_CLASSNAME}>
      <div className={ITEM_ROW_INNER_CLASSNAME}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-1">
            <ConnectionStatusDot
              dotClassName={cloudSessionToneDotClassName(presentation.tone)}
              pingClassName={cloudSessionTonePingClassName(presentation.tone)}
            />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="truncate font-medium text-sm">{presentation.title}</div>
            <div
              className={cn(
                "truncate text-xs",
                presentation.tone === "error" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {presentation.detail}
            </div>
            {presentation.progress === null ? null : (
              <CloudSessionProgressBar progress={presentation.progress} />
            )}
          </div>
        </div>
        {presentation.actionLabel === null ? null : (
          <Button
            size="sm"
            variant={presentation.tone === "ready" ? "default" : "outline"}
            disabled={actionPending}
            onClick={handleAction}
          >
            {actionPending ? "Working…" : presentation.actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
