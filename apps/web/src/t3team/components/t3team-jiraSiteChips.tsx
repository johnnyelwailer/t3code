import { cn } from "~/lib/utils";

import { jiraSiteChipStatusLabel, type JiraSiteChip } from "~/t3team/hooks/t3team-jiraSiteFilter";

/**
 * Filter chips for the Jira project list: one per site, only when two or more
 * sites are in play. A second click on the same chip clears the filter.
 */
export function JiraSiteChips({
  chips,
  selectedId,
  onToggle,
  onRetry,
}: {
  chips: ReadonlyArray<JiraSiteChip>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  /** Reconnect/reload, the same action the picker already exposes as Refresh. */
  onRetry?: (() => void) | undefined;
}) {
  if (chips.length < 2) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="jira-site-chips">
      {chips.map((chip) => {
        const status = jiraSiteChipStatusLabel(chip.status);
        const selected = selectedId === chip.id;
        return (
          <span key={chip.id} className="inline-flex items-center">
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(chip.id)}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
                selected
                  ? "border-foreground/30 bg-accent text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <span className="truncate">{chip.label}</span>
              {status ? <span className="shrink-0 text-muted-foreground">{status}</span> : null}
            </button>
            {status && onRetry ? (
              <button
                type="button"
                className="ml-1 text-xs text-foreground underline-offset-2 hover:underline"
                onClick={onRetry}
              >
                Retry
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
