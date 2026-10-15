/**
 * The sidebar draft row's status for a first message waiting on its cloud session. Same shape and
 * hues as the thread rows' status (icon + label, `text-info` while in progress, `text-error` on
 * failure), so a queued draft reads like the thread it is about to become.
 */
import { CircleAlertIcon, CloudIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { isCloudQueuedSendFailed, type CloudQueuedSend } from "./t3team-cloudQueuedSendModel";

export function cloudQueuedDraftStatusLabel(queued: CloudQueuedSend): string {
  return isCloudQueuedSendFailed(queued) ? "Cloud send failed" : "Queued for cloud session";
}

export function CloudQueuedDraftStatus(props: { readonly queued: CloudQueuedSend }) {
  const failed = isCloudQueuedSendFailed(props.queued);
  const Icon = failed ? CircleAlertIcon : CloudIcon;
  return (
    <span
      data-testid="sidebar-draft-queued-status"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
        failed ? "text-error" : "text-info",
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span role="status">{failed ? "Failed" : "Queued"}</span>
    </span>
  );
}
