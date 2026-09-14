import type { ReactNode } from "react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import {
  digestActionLine,
  digestItemActions,
  digestPrUrl,
  digestPrsFor,
} from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { DigestAgentDots } from "~/t3team/t3team-ProjectMyWorkDigestAgentDots";
import { DigestItemActions } from "~/t3team/t3team-ProjectMyWorkDigestActions";
import { DigestPeoplePills } from "~/t3team/t3team-ProjectMyWorkDigestPeople";
import { DigestPrChips } from "~/t3team/t3team-ProjectMyWorkDigestPrChips";

export function formatDigestAgo(nowMs: number, iso: string): string {
  const minutes = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export function DigestStatusDot({ status }: { status: string }) {
  return (
    <span className="inline-flex shrink-0 text-[11px] leading-none text-muted-foreground">
      {status}
    </span>
  );
}

export function DigestKicker({
  children,
  count,
  right,
}: {
  children: ReactNode;
  count?: number;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      <span>{children}</span>
      {count !== undefined ? (
        <span className="font-normal tabular-nums text-muted-foreground/70">{count}</span>
      ) : null}
      {right ? (
        <span className="ml-auto font-normal normal-case tracking-normal">{right}</span>
      ) : null}
    </div>
  );
}

export function DigestChips({
  graph,
  ticketId,
  nowMs,
}: {
  graph: DigestGraph;
  ticketId: string;
  nowMs: number;
}) {
  const chips: ReactNode[] = [];
  for (const d of graph.decisions.filter((d) => d.ticketId === ticketId)) {
    chips.push(
      <Badge key={d.id} variant="warning" className="max-w-full gap-1 font-normal">
        <span className="truncate">{d.question}</span>
        <span className="opacity-70">· {formatDigestAgo(nowMs, d.askedAt)}</span>
      </Badge>,
    );
  }
  const lastVisit = Date.parse(graph.viewer.lastVisitAt);
  for (const t of graph.transitions.filter(
    (t) => t.ticketId === ticketId && Date.parse(t.at) > lastVisit,
  )) {
    chips.push(
      <Badge key={`${t.ticketId}-${t.at}`} variant="outline" className="gap-1 font-normal">
        {t.from} → {t.to}
      </Badge>,
    );
  }
  const hasPrs = digestPrsFor(graph, ticketId).length > 0;
  if (chips.length === 0 && !hasPrs) return null;
  return (
    <div className="space-y-1">
      {chips.length > 0 ? <div className="flex flex-wrap gap-1">{chips}</div> : null}
      <DigestPrChips prs={digestPrsFor(graph, ticketId)} />
    </div>
  );
}

export function DigestProjectChip({ graph, projectId }: { graph: DigestGraph; projectId: string }) {
  if (graph.scope !== "all") return null;
  const project = graph.projects.find((entry) => entry.id === projectId);
  const name = project?.name ?? projectId;
  const chip = (
    <span className="shrink-0 rounded bg-muted/60 px-1.5 py-px text-[10px] text-muted-foreground">
      {name}
    </span>
  );
  return project?.url ? (
    <a href={project.url} className="hover:opacity-80">
      {chip}
    </a>
  ) : (
    chip
  );
}

export function DigestItemRow({
  ticket,
  why,
  graph,
  nowMs,
}: {
  ticket: ProjectTicket;
  why?: string | undefined;
  graph: DigestGraph;
  nowMs: number;
}) {
  const action = digestActionLine(graph, ticket.id);
  const actions = digestItemActions(graph, ticket.id, nowMs);
  const claims = graph.claims.filter((c) => c.ticketId === ticket.id);
  return (
    <div
      className="group relative cursor-pointer px-3 py-2 hover:bg-accent/30"
      onClick={() => window.open(ticket.ref.url, "_blank", "noopener")}
    >
      <div className="flex items-center gap-2">
        <JiraIssueTypeIcon issueType={ticket.issueType} className="size-3.5 shrink-0" />
        <a
          href={ticket.ref.url}
          className="shrink-0 font-mono text-[11.5px] text-muted-foreground hover:text-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {ticket.ref.displayId}
        </a>
        <a
          href={ticket.ref.url}
          className="min-w-0 truncate text-left text-[13px] font-medium leading-5 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {ticket.ref.title}
        </a>
        <DigestProjectChip graph={graph} projectId={ticket.projectId} />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="w-20 shrink-0 text-right">
            <DigestStatusDot status={ticket.status} />
          </span>
          <span className="flex w-10 shrink-0 justify-end">
            <DigestAgentDots claims={claims} nowMs={nowMs} />
          </span>
          <span className="flex w-12 shrink-0 items-center">
            <DigestPeoplePills ticket={ticket} viewerName={graph.viewer.name} />
          </span>
        </span>
      </div>
      {action || why ? (
        <div className="mt-0.5 min-w-0 space-y-0.5">
          {action ? (
            <p className="text-[11.5px] leading-4 text-foreground/80">
              {action.pr ? (
                <>
                  {action.text.replace(`${action.pr.repo}#${action.pr.number}`, "").trim()}
                  <a
                    href={digestPrUrl(action.pr)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 font-medium text-foreground hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {action.pr.repo}#{action.pr.number}
                  </a>
                </>
              ) : (
                action.text
              )}
            </p>
          ) : null}
          {why ? <p className="text-[11.5px] leading-4 text-muted-foreground">{why}</p> : null}
        </div>
      ) : null}
      <div className="mt-1 min-w-0">
        <DigestChips graph={graph} ticketId={ticket.id} nowMs={nowMs} />
      </div>
      <DigestItemActions actions={actions} />
    </div>
  );
}
