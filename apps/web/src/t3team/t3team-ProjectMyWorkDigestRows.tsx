import type { ReactNode } from "react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { getProjectTicketKanbanLane } from "~/t3team/t3team-projectTicketStatus";
import type { DigestChangeRequest, DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function formatDigestAgo(nowMs: number, iso: string): string {
  const minutes = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

const LANE_DOT = {
  inProgress: "bg-info",
  review: "bg-warning",
  todo: "bg-muted-foreground/50",
  done: "bg-success",
} as const;

export function DigestStatusDot({ status }: { status: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className={`size-1.5 rounded-full ${LANE_DOT[getProjectTicketKanbanLane(status)]}`} />
      {status}
    </span>
  );
}

export function DigestKicker({ children, count, right }: { children: ReactNode; count?: number; right?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      <span>{children}</span>
      {count !== undefined ? <span className="font-normal tabular-nums text-muted-foreground/70">{count}</span> : null}
      {right ? <span className="ml-auto font-normal normal-case tracking-normal">{right}</span> : null}
    </div>
  );
}

const PR_STATE: Record<DigestChangeRequest["state"], { label: string; variant: "error" | "warning" | "success" | "secondary" }> = {
  "needs-you": { label: "your review", variant: "error" },
  "changes-requested": { label: "changes requested", variant: "warning" },
  approved: { label: "approved", variant: "success" },
  waiting: { label: "waiting", variant: "secondary" },
};

export function DigestChips({ graph, ticketId, nowMs }: { graph: DigestGraph; ticketId: string; nowMs: number }) {
  const chips: ReactNode[] = [];
  for (const d of graph.decisions.filter((d) => d.ticketId === ticketId)) {
    chips.push(
      <Badge key={d.id} variant="warning" className="max-w-full gap-1 font-normal">
        <span className="truncate">{d.question}</span>
        <span className="opacity-70">· {formatDigestAgo(nowMs, d.askedAt)}</span>
      </Badge>,
    );
  }
  for (const r of graph.changeRequests.filter((r) => r.ticketId === ticketId)) {
    const state = PR_STATE[r.state];
    chips.push(
      <Badge key={r.id} variant={state.variant} className="gap-1 font-normal">
        <span className="font-mono text-[10.5px]">{r.repo}#{r.number}</span>
        <span className="opacity-80">{state.label}</span>
      </Badge>,
    );
  }
  for (const c of graph.claims.filter((c) => c.ticketId === ticketId)) {
    chips.push(
      <Badge key={c.threadId} variant="info" className="gap-1 font-normal">
        {c.agent}
        <span className="opacity-70">· {formatDigestAgo(nowMs, c.lastActivityAt)}</span>
      </Badge>,
    );
  }
  const lastVisit = Date.parse(graph.viewer.lastVisitAt);
  for (const t of graph.transitions.filter((t) => t.ticketId === ticketId && Date.parse(t.at) > lastVisit)) {
    chips.push(
      <Badge key={`${t.ticketId}-${t.at}`} variant="outline" className="gap-1 font-normal">
        {t.from} → {t.to}
      </Badge>,
    );
  }
  return chips.length === 0 ? null : <div className="flex flex-wrap gap-1">{chips}</div>;
}

export function DigestProjectChip({ graph, projectId }: { graph: DigestGraph; projectId: string }) {
  if (graph.scope !== "all") return null;
  const name = graph.projects.find((project) => project.id === projectId)?.name ?? projectId;
  return <span className="shrink-0 rounded bg-muted/60 px-1.5 py-px text-[10px] text-muted-foreground">{name}</span>;
}

export function DigestItemRow({
  ticket,
  index,
  why,
  graph,
  nowMs,
  onOpen,
}: {
  ticket: ProjectTicket;
  index?: number | undefined;
  why?: string | undefined;
  graph: DigestGraph;
  nowMs: number;
  onOpen: () => void;
}) {
  return (
    <div className="grid grid-cols-[2rem_1.25rem_6.5rem_minmax(0,1fr)_auto] items-start gap-x-2 px-3 py-2 hover:bg-accent/30">
      <span className="pt-0.5 text-[11px] tabular-nums text-muted-foreground/60">
        {index !== undefined ? String(index).padStart(2, "0") : ""}
      </span>
      <JiraIssueTypeIcon issueType={ticket.issueType} className="mt-0.5 size-3.5" />
      <button type="button" onClick={onOpen} className="pt-0.5 text-left font-mono text-[11.5px] text-muted-foreground hover:text-foreground">
        {ticket.ref.displayId}
      </button>
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 truncate text-left text-[13px] font-medium leading-5 hover:underline">
            {ticket.ref.title}
          </button>
          <DigestProjectChip graph={graph} projectId={ticket.projectId} />
        </div>
        {why ? <p className="text-[11.5px] leading-4 text-muted-foreground">{why}</p> : null}
        <DigestChips graph={graph} ticketId={ticket.id} nowMs={nowMs} />
      </div>
      <DigestStatusDot status={ticket.status} />
    </div>
  );
}
