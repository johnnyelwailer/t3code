import { CornerDownRight, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectTicket } from "~/t3work/t3work-types";
import { JiraIssueTypeIcon } from "~/t3work/components/ticket/t3work-JiraIssueType";

export function TicketWorkItemCard({
  ticket,
  onOpen,
  compact,
  flat,
  child,
  childCount,
  extraChildren,
}: {
  ticket: ProjectTicket;
  onOpen: () => void;
  compact?: boolean;
  flat?: boolean;
  child?: boolean;
  childCount?: number;
  extraChildren?: ReactNode;
}) {
  return (
    <div className={`block w-full text-left ${child ? "relative pl-3" : ""}`}>
      {child && <span className="absolute top-2 left-0 h-px w-2 bg-border/70" aria-hidden />}
      <button type="button" className="block w-full text-left" onClick={onOpen}>
        <div
          className={`h-full rounded-md border shadow-sm transition-all hover:-translate-y-px hover:bg-accent/35 hover:shadow-md ${
            child
              ? "border-dashed border-border/70 bg-muted/30"
              : flat
                ? "border-border/70 bg-background/55"
                : "border-border/80 bg-card/75"
          }`}
        >
          <div className={`flex h-full flex-col ${compact ? "gap-2 p-2.5" : "gap-3 p-3.5"}`}>
            <div className="flex items-start gap-2">
              <JiraIssueTypeIcon
                issueType={ticket.issueType}
                issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {ticket.ref.displayId}
                  </span>
                  {child ? (
                    <span
                      className="inline-flex items-center text-muted-foreground/75"
                      aria-label="Child item"
                    >
                      <CornerDownRight className="size-3" />
                    </span>
                  ) : childCount ? (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      aria-label={`${childCount} child items`}
                    >
                      <GitBranch className="size-3" />
                      <span className="tabular-nums">{childCount}</span>
                    </span>
                  ) : null}
                  <span className="text-[10px] text-muted-foreground/75">{ticket.status}</span>
                  {ticket.priority && (
                    <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {ticket.priority}
                    </span>
                  )}
                </div>
                <div
                  className={`mt-1 font-medium ${compact ? "text-xs leading-4" : "text-sm leading-5"}`}
                >
                  {ticket.ref.title}
                </div>
              </div>
            </div>

            {ticket.assignee && (
              <div className="mt-auto text-xs text-muted-foreground">
                Assigned to {ticket.assignee}
              </div>
            )}
          </div>
        </div>
      </button>
      {extraChildren}
    </div>
  );
}

export function TicketWorkItemRow({
  ticket,
  onOpen,
  child,
  childCount,
  extraChildren,
}: {
  ticket: ProjectTicket;
  onOpen: () => void;
  child?: boolean;
  childCount?: number;
  extraChildren?: ReactNode;
}) {
  return (
    <div className="w-full">
      <button
        type="button"
        className={`flex w-full items-start gap-2 rounded-md border border-transparent px-1 py-1 text-left transition-colors hover:border-border/50 hover:bg-accent/25 ${child ? "relative pl-3" : ""}`}
        onClick={onOpen}
      >
        {child && <span className="absolute top-2 left-0 h-px w-2 bg-border/70" aria-hidden />}
        <JiraIssueTypeIcon
          issueType={ticket.issueType}
          issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {ticket.ref.displayId}
            </span>
            {child ? (
              <span
                className="inline-flex items-center text-muted-foreground/75"
                aria-label="Child item"
              >
                <CornerDownRight className="size-3" />
              </span>
            ) : childCount ? (
              <span
                className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                aria-label={`${childCount} child items`}
              >
                <GitBranch className="size-3" />
                <span className="tabular-nums">{childCount}</span>
              </span>
            ) : null}
            <span className="text-[10px] text-muted-foreground/75">{ticket.status}</span>
            {ticket.priority && (
              <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {ticket.priority}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm font-medium leading-5">{ticket.ref.title}</div>
          {ticket.assignee && (
            <div className="text-xs text-muted-foreground">Assigned to {ticket.assignee}</div>
          )}
        </div>
      </button>
      {extraChildren}
    </div>
  );
}

export function ToggleGroup({
  value,
  onChange,
  options,
  wrap,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  wrap?: boolean;
}) {
  return (
    <div
      className={`inline-flex rounded-md border border-border/80 bg-background p-0.5 ${
        wrap ? "flex-wrap" : ""
      }`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded px-2.5 py-1 text-xs transition-colors ${
            value === option.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
