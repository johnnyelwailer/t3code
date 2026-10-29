import { DownloadIcon, KeyRoundIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
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
  if (view.kind === "downloading") {
    return (
      <Alert variant="sidebar" data-testid="nexi-update-notice" data-kind={view.kind}>
        <DownloadIcon />
        <AlertTitle>{view.title}</AlertTitle>
        <AlertDescription>
          {view.percent === null ? "Starting…" : `${Math.round(view.percent)}%`}
        </AlertDescription>
      </Alert>
    );
  }
  const problem = view.kind === "unreachable" || view.kind === "verification-failed";
  const icon =
    view.kind === "signed-out" ? (
      <KeyRoundIcon />
    ) : problem ? (
      <TriangleAlertIcon />
    ) : (
      <RefreshCwIcon />
    );
  return (
    <Alert
      variant={view.kind === "verification-failed" ? "error" : "sidebar"}
      data-testid="nexi-update-notice"
      data-kind={view.kind}
    >
      {icon}
      <AlertTitle>{view.title}</AlertTitle>
      <AlertDescription>
        {"description" in view ? <p>{view.description}</p> : null}
        {"notes" in view && view.notes.length > 0 ? (
          <ul className="mt-1 list-disc pl-3.5" aria-label="Release notes">
            {view.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
      <AlertAction>
        <Button size="xs" disabled={busy} onClick={onAction}>
          {view.actionLabel}
        </Button>
        {view.dismissible ? (
          <Button size="xs" variant="ghost-muted" disabled={busy} onClick={onLater}>
            Later
          </Button>
        ) : null}
      </AlertAction>
    </Alert>
  );
}
