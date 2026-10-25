import { RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { CloudSessionSetupCardProps } from "./t3team-CloudSessionSetupCard";

export function SetupActions({
  failed,
  detailsUrl,
  onCancel,
  onRetry,
  onTryAgain,
  sending,
}: Pick<CloudSessionSetupCardProps, "onCancel" | "onRetry" | "onTryAgain" | "sending"> & {
  readonly failed: boolean;
  readonly detailsUrl: string | null;
}) {
  return (
    <>
      {failed || onCancel || onRetry ? (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {failed && onTryAgain ? (
            <Button type="button" size="xs" variant="outline" onClick={onTryAgain}>
              <RotateCcwIcon aria-hidden />
              Try again
            </Button>
          ) : null}
          {onRetry ? (
            <Button type="button" size="xs" variant="outline" onClick={onRetry}>
              <RotateCcwIcon aria-hidden />
              Retry sending
            </Button>
          ) : null}
          {onCancel ? (
            <Button
              type="button"
              size="xs"
              variant="ghost-muted"
              disabled={sending}
              onClick={onCancel}
            >
              <XIcon aria-hidden />
              {sending ? "Sending…" : "Cancel message"}
            </Button>
          ) : null}
          {failed && detailsUrl !== null ? (
            <a
              href={detailsUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              See what happened
            </a>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
