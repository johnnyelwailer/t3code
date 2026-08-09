import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";

/**
 * Wraps a field's trigger so its undo confirmation or error message float below it instead of
 * pushing layout — a taller field breaks `items-center` alignment against its neighbours in a shared
 * row (see the title band's meta row), and nothing here should reflow when a write starts or lands.
 */
export function WorkItemFieldOverlay({
  children,
  overlay,
  className,
}: {
  readonly children: ReactNode;
  readonly overlay?: ReactNode | undefined;
  readonly className?: string | undefined;
}) {
  return (
    <span
      className={cn("relative inline-flex min-w-0 max-w-full items-center leading-none", className)}
    >
      {children}
      {overlay ? (
        <span className="absolute left-0 top-full z-20 mt-1 w-max max-w-64 text-nowrap rounded-md border border-border bg-popover px-2 py-1 text-popover-foreground shadow-md">
          {overlay}
        </span>
      ) : null}
    </span>
  );
}

/** The "field → value · Undo" confirmation shown for a few seconds after a successful write. */
export function WorkItemFieldUndoBanner({
  label,
  onUndo,
}: {
  readonly label: string;
  readonly onUndo: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="truncate">{label}</span>
      <button
        type="button"
        className="shrink-0 font-medium text-primary hover:underline"
        onClick={onUndo}
      >
        Undo
      </button>
    </span>
  );
}
