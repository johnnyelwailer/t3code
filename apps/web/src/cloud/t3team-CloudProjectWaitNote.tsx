/**
 * The note under the step list while "Project ready" waits: what is expected and, after a long
 * wait, what is still missing with a one-line diagnostic to copy. Shared by the thread's queued
 * send card and the setup card; the words and the thresholds are `t3team-cloudProjectWaitPresentation`.
 */
import { Check, Copy } from "lucide";

import { MorphIcon } from "~/components/MorphIcon";
import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import type { CloudProjectWaitNotice } from "./t3team-cloudProjectWaitPresentation";

export function CloudProjectWaitNote({
  notice,
  className,
}: {
  readonly notice: CloudProjectWaitNotice;
  readonly className?: string;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    timeout: 1500,
    target: "project wait diagnostic",
  });
  if (notice.text === null) return null;
  return (
    <div
      data-cloud-project-wait={notice.level}
      data-cloud-project-wait-reason={notice.reason}
      className={cn(
        "rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground",
        className,
      )}
    >
      <p>{notice.text}</p>
      {notice.diagnostic === null ? null : (
        <div className="mt-1.5 flex items-center justify-between gap-2 font-mono">
          <span data-cloud-project-wait-diagnostic="" className="min-w-0 break-all">
            {notice.diagnostic}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Copy diagnostic"
            onClick={() => copyToClipboard(notice.diagnostic ?? "", undefined)}
          >
            <MorphIcon className="size-3.5" icon={isCopied ? Check : Copy} />
          </Button>
        </div>
      )}
    </div>
  );
}
