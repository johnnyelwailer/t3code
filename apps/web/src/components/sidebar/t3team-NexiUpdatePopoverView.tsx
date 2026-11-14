import { Button } from "../ui/button";
import { PopoverTitle } from "../ui/popover";
import type { NexiUpdateNoticeView as View } from "./t3team-nexiUpdateNotice.logic";
import { UpdateReleaseNotesList } from "./t3team-UpdateReleaseNotesList";

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
      <UpdateReleaseNotesList
        notes={view.notes}
        releaseUrl={view.releaseUrl}
        onOpenHistory={onOpenHistory}
      />
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
