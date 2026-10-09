import { ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";

/** Column title row with the collapse toggle (omitted when the board has no collapse state). */
export function ProjectDashboardKanbanColumnHeader({
  title,
  count,
  onCollapse,
  headerBorderOpacity = 1,
}: {
  title: string;
  count: number;
  onCollapse?: () => void;
  /** Semantic-zoom fade for the header rule; 1 keeps today's border. */
  headerBorderOpacity?: number;
}) {
  return (
    <div
      className="mb-2 flex items-center justify-between gap-1 pb-2"
      style={{
        borderBottomWidth: headerBorderOpacity > 0.02 ? 1 : 0,
        borderBottomStyle: "solid",
        borderBottomColor: `color-mix(in oklab, var(--border) ${Math.round(headerBorderOpacity * 85)}%, transparent)`,
      }}
    >
      <h4 className="min-w-0 truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-2xs text-muted-foreground">{count}</span>
        {onCollapse ? (
          <Button
            type="button"
            size="icon-micro"
            variant="ghost-muted"
            aria-label={`Collapse ${title} column`}
            aria-expanded
            onClick={onCollapse}
          >
            <ChevronsLeftIcon />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** A collapsed column: the whole strip is the expand button, name running down its length. */
export function ProjectDashboardKanbanCollapsedColumn({
  title,
  count,
  onExpand,
}: {
  title: string;
  count: number;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Expand ${title} column`}
      aria-expanded={false}
      onClick={onExpand}
      className="flex h-full min-h-[12rem] w-full cursor-pointer flex-col items-center gap-2 rounded-[inherit] py-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronsRightIcon className="size-3.5 shrink-0" />
      <span className="text-2xs">{count}</span>
      <span className="truncate text-2xs font-semibold uppercase tracking-wide [writing-mode:vertical-rl]">
        {title}
      </span>
    </button>
  );
}
