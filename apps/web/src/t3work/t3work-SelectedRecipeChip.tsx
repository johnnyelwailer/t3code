import { X } from "lucide-react";

import { Button } from "~/t3work/components/ui/t3work-button";

export function T3workSelectedRecipeChip({
  title,
  description,
  summary,
  onClear,
}: {
  readonly title: string;
  readonly description: string;
  readonly summary?: string | undefined;
  readonly onClear?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/15 bg-accent/30 px-3 py-2.5">
      <div className="min-w-0 space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
          Selected action
        </div>
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs leading-5 text-muted-foreground">{description}</div>
        {summary ? (
          <div className="text-[11px] leading-5 text-muted-foreground/80">{summary}</div>
        ) : null}
      </div>
      {onClear ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0"
          aria-label="Clear selected action"
          onClick={onClear}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
