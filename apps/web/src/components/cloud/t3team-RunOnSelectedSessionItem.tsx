import { CloudIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { presentRunOnSelection, type RunOnSelectionStatus } from "./t3team-runOnSelection";

/**
 * The Run-on menu's selected cloud entry while the selection has no session row of its own: right
 * after the pick, and when the create failed before any machine existed. Progress and failure read
 * here, inside the entry that is selected, so neither needs a row of its own beside it.
 */
export function RunOnSelectedSessionItem(props: {
  readonly label: string;
  readonly status: RunOnSelectionStatus;
  /** Starts another session in this entry's place. */
  readonly onRetry: () => void;
}) {
  const words = presentRunOnSelection(props.status);
  const working = props.status === "requesting" || props.status === "provisioning";
  return (
    <div
      data-run-on-selected-session=""
      className="flex w-full items-start gap-1.5 rounded-sm bg-muted/60 px-2 py-1.5 sm:text-sm"
    >
      <CloudIcon
        className={cn("mt-1 size-3 shrink-0", working && "animate-pulse")}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-1 flex-col items-start text-left">
        <span className="max-w-full truncate">{props.label}</span>
        <span className="max-w-full truncate text-muted-foreground text-xs">
          {words.detail === null ? words.title : `${words.title} · ${words.detail}`}
        </span>
      </span>
      {words.retry ? (
        <button
          type="button"
          onClick={props.onRetry}
          className="ml-1 shrink-0 cursor-pointer rounded-sm border bg-background px-1.5 py-0.5 text-xs hover:bg-muted"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
