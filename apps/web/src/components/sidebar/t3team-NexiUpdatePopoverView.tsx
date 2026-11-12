import { ExternalLinkIcon } from "lucide-react";

import { Button } from "../ui/button";
import { PopoverTitle } from "../ui/popover";
import type { NexiUpdateNoticeView as View } from "./t3team-nexiUpdateNotice.logic";

/** Presentational popover body; the footer decides when it opens and what its buttons do. */
export function NexiUpdatePopoverView({
  view,
  busy,
  onAction,
  onLater,
  onOpenHistory,
}: {
  readonly view: View;
  readonly busy: boolean;
  readonly onAction: () => void;
  readonly onLater: () => void;
  readonly onOpenHistory: (url: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="nexi-update-popover">
      <PopoverTitle>{view.title}</PopoverTitle>
      {view.notes.length > 0 ? (
        <ul
          className="list-disc space-y-1 pl-4 leading-5 text-popover-foreground/90"
          aria-label="Release notes"
        >
          {view.notes.map((note) => (
            <li key={note} className="break-words">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
      {view.releaseUrl !== null ? (
        <a
          className="-mx-1 inline-flex w-fit items-center gap-1 rounded-sm px-1 py-0.5 text-muted-foreground underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          href={view.releaseUrl}
          onClick={(event) => {
            event.preventDefault();
            if (view.releaseUrl !== null) onOpenHistory(view.releaseUrl);
          }}
        >
          Full history
          <ExternalLinkIcon aria-hidden className="size-3 shrink-0" strokeWidth={2} />
        </a>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost-muted" disabled={busy} onClick={onLater}>
          Later
        </Button>
        <Button size="xs" disabled={busy} onClick={onAction}>
          {view.actionLabel}
        </Button>
      </div>
    </div>
  );
}
