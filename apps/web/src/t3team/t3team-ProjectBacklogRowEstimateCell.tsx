/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import { Minus, Plus } from "lucide-react";

import { Input } from "~/t3team/components/ui/t3team-input";
import { cn } from "~/t3team/lib/t3team-utils";
import { ProjectBacklogEstimateReadonlyValue } from "~/t3team/t3team-ProjectBacklogEstimateReadonly";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import { useProjectBacklogEstimateCell } from "~/t3team/t3team-useProjectBacklogEstimateCell";
import type { ProjectTicket } from "~/t3team/t3team-types";

/**
 * The estimate cell for a ticket row — the one estimate editor in the app.
 *
 * Split out of `t3team-ProjectBacklogRowPlanningCells.tsx` (which now only re-exports) once it grew
 * unit-aware ± stepping, and because it is no longer backlog-only: the work item's child rows render
 * it too. Draft/commit behaviour lives in `useProjectBacklogEstimateCell`; this file is markup.
 *
 * The unit — hours or story points, and whether the field is editable at all — comes from the
 * project's own Jira configuration, never from the call site.
 */
export function ProjectBacklogRowEstimateCell({
  ticket,
  estimateFieldLabel,
  onUpdateEstimate,
  compact = false,
  quiet = false,
  draftValue,
  onDraftChange,
  onCommitRequest,
  onResetDraft,
}: {
  ticket: ProjectTicket;
  estimateFieldLabel?: string;
  onUpdateEstimate: (ticket: ProjectTicket, estimateValue: number | null) => Promise<void>;
  compact?: boolean;
  /** Drop the field's chrome until hover or focus, for use inside a list row rather than a table. */
  quiet?: boolean;
  draftValue?: string;
  onDraftChange?: (value: string) => void;
  onCommitRequest?: () => void;
  onResetDraft?: () => void;
}) {
  const cell = useProjectBacklogEstimateCell({
    ticket,
    ...(estimateFieldLabel ? { estimateFieldLabel } : {}),
    onUpdateEstimate,
    ...(draftValue !== undefined ? { draftValue } : {}),
    ...(onDraftChange ? { onDraftChange } : {}),
  });

  const label = cell.presentation.label;
  const readonlyClassName = compact
    ? "inline-flex h-7 min-w-[5.25rem] items-center justify-center gap-1 px-2 text-[11px] font-medium tabular-nums text-foreground/85"
    : "inline-flex h-8 min-w-[6rem] items-center justify-center gap-1 px-2 text-[12px] font-medium tabular-nums text-foreground/85";

  if (!cell.available) {
    return (
      <div className="min-w-0">
        <Badge variant="outline">Unavailable</Badge>
      </div>
    );
  }

  if (!cell.presentation.editable) {
    return (
      <div className="min-w-0">
        <ProjectBacklogEstimateReadonlyValue
          presentation={cell.presentation}
          className={readonlyClassName}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {compact ? null : (
        <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
      )}

      <div
        ref={cell.inputContainerRef}
        onMouseDown={cell.handleWrapperMouseDown}
        title={cell.error ?? undefined}
        className={cn(
          "cursor-text items-center rounded-md border transition-colors",
          compact ? "inline-flex h-7 min-w-[5.25rem] gap-1 px-1.5" : "inline-flex h-8 px-2",
          cell.error
            ? "border-destructive bg-background/90"
            : quiet
              ? /*
                  In a list row the filled box reads as a heavy control sitting mid-line. Quiet keeps
                  it flush until you go near it, then it becomes obviously editable.
                */
                "border-transparent bg-transparent hover:border-border/70 hover:bg-background/90 focus-within:border-border/70 focus-within:bg-background/90"
              : "border-border/70 bg-background/90",
        )}
      >
        <Input
          aria-label={`${label} for ${ticket.ref.displayId}`}
          aria-invalid={cell.error ? true : undefined}
          aria-errormessage={cell.error ? `${ticket.id}-estimate-error` : undefined}
          unstyled
          className={cn(
            "border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
            "[&_[data-slot=input]]:bg-transparent [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:text-right [&_[data-slot=input]]:tabular-nums",
            compact
              ? "h-full w-11 [&_[data-slot=input]]:h-full [&_[data-slot=input]]:text-[11px] [&_[data-slot=input]]:font-medium [&_[data-slot=input]]:leading-none"
              : "h-6 w-14 [&_[data-slot=input]]:h-6 [&_[data-slot=input]]:text-[12px]",
          )}
          inputMode="decimal"
          type={compact ? "text" : "number"}
          value={cell.draft}
          disabled={cell.saving}
          onChange={(event) => cell.updateDraft(event.target.value)}
          onBlur={() => {
            if (!compact && !cell.isControlled) void cell.commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (onCommitRequest) onCommitRequest();
              else void cell.commit();
            }
            if (compact && event.key === "Escape") {
              event.preventDefault();
              if (onResetDraft) onResetDraft();
              else cell.updateDraft(cell.persistedDraft);
              cell.setError(null);
            }
          }}
          placeholder="0"
        />

        {cell.presentation.valueSuffix ? (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {cell.presentation.valueSuffix}
          </span>
        ) : null}

        {/*
          Revealed with the field's own chrome rather than always on: in a quiet row the ± buttons
          would be two more permanent marks per line. Sizing by hand is still one click.
        */}
        <span
          className={cn(
            "ml-0.5 flex shrink-0 items-center gap-0.5",
            quiet && "opacity-0 transition-opacity group-hover/issue-row:opacity-100",
          )}
        >
          {([-cell.stepSize, cell.stepSize] as const).map((delta) => (
            <button
              key={delta}
              type="button"
              aria-label={`${delta < 0 ? "Decrease" : "Increase"} ${label.toLowerCase()} for ${ticket.ref.displayId}`}
              disabled={cell.saving || (delta < 0 && Number(cell.draft.trim() || 0) <= 0)}
              className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              onClick={(event) => {
                event.stopPropagation();
                void cell.step(delta);
              }}
            >
              {delta < 0 ? <Minus className="size-3" /> : <Plus className="size-3" />}
            </button>
          ))}
        </span>
      </div>

      {cell.error ? (
        <span id={`${ticket.id}-estimate-error`} className="sr-only">
          {cell.error}
        </span>
      ) : null}
    </div>
  );
}
