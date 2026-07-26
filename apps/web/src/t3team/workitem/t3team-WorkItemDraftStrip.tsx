import { Bot } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import {
  WorkItemDraftStripRow,
  type WorkItemDraftStripRowData,
} from "~/t3team/workitem/t3team-WorkItemDraftStripRow";

/**
 * The one panel every draft marker and the nav pill open — docked directly under the section nav,
 * scrolling away with the rest of the content rather than staying pinned. Never a second, competing
 * popover: whichever field you click, this is the surface that opens.
 */
export function WorkItemDraftStrip({
  rows,
  resolvableCount,
  onAcceptResolvable,
  onDismissAll,
}: {
  readonly rows: ReadonlyArray<WorkItemDraftStripRowData>;
  /** Rows the strip can resolve itself (scalar fields with a wired accept) — never document rows. */
  readonly resolvableCount: number;
  /** Undefined when nothing here is strip-resolvable (e.g. only a description draft is pending). */
  readonly onAcceptResolvable?: (() => void) | undefined;
  readonly onDismissAll: () => void;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden border-b border-primary/20 bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-3 py-2 @2xl/workitem:px-5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Bot className="size-3.5 text-primary" aria-hidden="true" />
          {rows.length} proposed
        </span>
        <span className="flex gap-1.5">
          <Button size="xs" variant="ghost" onClick={onDismissAll}>
            Dismiss all
          </Button>
          {/*
            Scoped to strip-resolvable rows only, and named for exactly what it does — one click must
            never commit a description or comment draft nobody has read.
          */}
          {onAcceptResolvable ? (
            <Button size="xs" onClick={onAcceptResolvable}>
              Accept the {resolvableCount} field change{resolvableCount === 1 ? "" : "s"}
            </Button>
          ) : null}
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {rows.map((row) => (
          <WorkItemDraftStripRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}
