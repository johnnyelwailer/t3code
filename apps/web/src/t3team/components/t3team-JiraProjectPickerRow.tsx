import { ArrowUpRight, Check, ChevronRight } from "lucide-react";

import { cn } from "~/lib/utils";
import { ProjectAvatar } from "~/t3team/components/t3team-ProjectAvatar";
import type { CatalogRow } from "~/t3team/hooks/t3team-createProjectCatalogRows";

/**
 * One Jira project. The whole row is the action: it picks the project, or — for one that is
 * already added — opens it. Which of the two is said once, by the trailing affordance and the
 * section the row sits in, not by a badge on every row.
 */
export function JiraProjectPickerRow({
  row,
  showSite,
  selected = false,
  onChoose,
}: {
  row: CatalogRow;
  showSite: boolean;
  /** For pickers that pick first and confirm later (repair), marks the current choice. */
  selected?: boolean;
  onChoose: (row: CatalogRow) => void;
}) {
  const { entry, existingProjectId } = row;
  const added = existingProjectId !== null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(row)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "group flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring",
          selected && "bg-accent/60",
        )}
      >
        <ProjectAvatar
          title={entry.title}
          projectKey={entry.key}
          iconUrl={entry.iconUrl}
          className="size-5 shrink-0 rounded-sm"
        />
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className={cn("truncate text-sm font-medium", added && "text-muted-foreground")}>
            {entry.title}
          </span>
          {entry.key ? (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{entry.key}</span>
          ) : null}
        </span>
        {showSite && entry.siteHost ? (
          <span className="shrink-0 text-2xs text-muted-foreground/80">{entry.siteHost}</span>
        ) : null}
        {selected ? (
          <Check className="size-4 shrink-0 text-primary" />
        ) : added ? (
          <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground group-hover:text-foreground">
            Open
            <ArrowUpRight className="size-3.5" />
          </span>
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
        )}
      </button>
    </li>
  );
}
