import { ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";

/**
 * A content section in the detail view.
 *
 * The previous design wrapped every block in a bordered card, which read as a stack of unrelated
 * boxes. Sections instead separate on spacing and a quiet heading, so the page reads as one
 * document. Borders are reserved for things that genuinely group — the properties rail, a comment.
 *
 * `count` sits next to the title so a section announces its own size without a sentence saying so.
 * `action` is the section's own affordance (add a comment, attach a file) and stays reachable at
 * every width because the header wraps rather than truncating.
 */
export function WorkItemSection({
  title,
  count,
  action,
  collapsible = false,
  defaultCollapsed = false,
  children,
  className,
}: {
  readonly title?: string;
  readonly count?: number;
  readonly action?: ReactNode;
  readonly collapsible?: boolean;
  readonly defaultCollapsed?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const contentId = useId();
  const isCollapsed = collapsible && collapsed;

  if (!title) {
    return <section className={cn("min-w-0", className)}>{children}</section>;
  }

  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-2.5 flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <HeadingControl
          collapsible={collapsible}
          isCollapsed={isCollapsed}
          contentId={contentId}
          title={title}
          count={count}
          onToggle={() => setCollapsed((current) => !current)}
        />
        {action ? <div className="flex shrink-0 items-center gap-1.5">{action}</div> : null}
      </div>

      <div id={contentId} hidden={isCollapsed} className="min-w-0">
        {children}
      </div>
    </section>
  );
}

function HeadingControl({
  collapsible,
  isCollapsed,
  contentId,
  title,
  count,
  onToggle,
}: {
  readonly collapsible: boolean;
  readonly isCollapsed: boolean;
  readonly contentId: string;
  readonly title: string;
  readonly count: number | undefined;
  readonly onToggle: () => void;
}) {
  const label = (
    <>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {count !== undefined && count > 0 ? (
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </>
  );

  if (!collapsible) {
    return <div className="flex min-w-0 items-center gap-2">{label}</div>;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      aria-controls={contentId}
      className="-ml-1 flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          !isCollapsed && "rotate-90",
        )}
      />
      {label}
    </button>
  );
}
