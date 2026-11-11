/**
 * The note under the step list while "Project ready" waits: one plain status sentence, and after a
 * long wait a Retry plus a closed "Details" disclosure holding the line a bug report needs. The
 * words and the thresholds are `t3team-cloudProjectWaitPresentation`; the diagnostic also goes to
 * the console once, so a field report has it without opening the disclosure.
 */
import { Check, Copy } from "lucide";
import { ChevronRightIcon, RotateCcwIcon } from "lucide-react";
import { useEffect } from "react";

import { MorphIcon } from "~/components/MorphIcon";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { logCloudProjectWaitDiagnostic } from "./t3team-cloudProjectWaitLog";
import type { CloudProjectWaitNotice } from "./t3team-cloudProjectWaitPresentation";

export function CloudProjectWaitNote({
  notice,
  onRetry,
  className,
}: {
  readonly notice: CloudProjectWaitNotice;
  /** Start the wait over; offered once the wait is long and waiting can still end it. */
  readonly onRetry?: (() => void) | undefined;
  readonly className?: string;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    timeout: 1500,
    target: "project wait diagnostic",
  });
  const { diagnostic } = notice;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the diagnostic the visible copy no longer carries to the console, once per line
  useEffect(() => {
    if (diagnostic !== null) logCloudProjectWaitDiagnostic(diagnostic);
  }, [diagnostic]);
  if (notice.text === null) return null;
  const retry = notice.level === "slow" && !notice.blocking ? onRetry : undefined;
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
      {retry === undefined ? null : (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="mt-2"
          data-cloud-project-wait-retry=""
          onClick={retry}
        >
          <RotateCcwIcon aria-hidden />
          Retry
        </Button>
      )}
      {diagnostic === null ? null : (
        <Collapsible>
          <CollapsibleTrigger className="group mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRightIcon
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-data-panel-open:rotate-90"
            />
            Details
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <div className="mt-1 flex items-center justify-between gap-2 font-mono">
              <span data-cloud-project-wait-diagnostic="" className="min-w-0 break-all">
                {diagnostic}
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Copy diagnostic"
                onClick={() => copyToClipboard(diagnostic, undefined)}
              >
                <MorphIcon className="size-3.5" icon={isCopied ? Check : Copy} />
              </Button>
            </div>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </div>
  );
}
