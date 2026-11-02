import { RefreshCwIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import type { NexiUpdateNoticeView as View } from "./t3team-nexiUpdateNotice.logic";

/** Presentational update notice; the container decides when it shows and what its buttons do. */
export function NexiUpdateNoticeView({
  view,
  busy,
  onAction,
  onLater,
}: {
  readonly view: View;
  readonly busy: boolean;
  readonly onAction: () => void;
  readonly onLater: () => void;
}) {
  return (
    <Alert variant="sidebar" data-testid="nexi-update-notice" data-kind={view.kind}>
      <RefreshCwIcon />
      <AlertTitle>{view.title}</AlertTitle>
      <AlertDescription>
        {view.notes.length > 0 ? (
          <ul className="mt-1 list-disc pl-3.5" aria-label="Release notes">
            {view.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="xs" disabled={busy} onClick={onAction}>
            {view.actionLabel}
          </Button>
          <Button size="xs" variant="ghost-muted" disabled={busy} onClick={onLater}>
            Later
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
