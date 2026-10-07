import type { MouseEvent, ReactNode } from "react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import {
  digestActionLine,
  digestItemActions,
  digestPrUrl,
  digestPrsFor,
} from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { DigestClaim, DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { DigestAgentDots } from "~/t3team/t3team-ProjectMyWorkDigestAgentDots";
import { DigestItemActions } from "~/t3team/t3team-ProjectMyWorkDigestActions";
import { DigestDependencyLine } from "~/t3team/t3team-ProjectMyWorkDigestDependencies";
import { DigestPeoplePills } from "~/t3team/t3team-ProjectMyWorkDigestPeople";
import { DigestPrChips } from "~/t3team/t3team-ProjectMyWorkDigestPrChips";
import { digestRepoLabeler } from "~/t3team/t3team-projectMyWorkDigestRepoLabels";
import {
  DigestProjectChip,
  DigestStatusDot,
  formatDigestAgo,
} from "~/t3team/t3team-ProjectMyWorkDigestChips";

export {
  formatDigestAgo,
  DigestStatusDot,
  DigestKicker,
  DigestProjectChip,
} from "~/t3team/t3team-ProjectMyWorkDigestChips";

export function DigestChips({
  graph,
  ticketId,
  nowMs,
  claims,
}: {
  graph: DigestGraph;
  ticketId: string;
  nowMs: number;
  claims: readonly DigestClaim[];
}) {
  const chips: ReactNode[] = [];
  for (const d of graph.decisions.filter((d) => d.ticketId === ticketId)) {
    chips.push(
      <Badge key={d.id} variant="warning" className="max-w-full">
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
      <Badge key={`${t.ticketId}-${t.at}`} variant="outline">
        {t.from} → {t.to}
      </Badge>,
    );
  }
  const prs = digestPrsFor(graph, ticketId);
  if (chips.length === 0 && prs.length === 0) return null;
  return (
    <div className="space-y-1">
      {chips.length > 0 ? <div className="flex flex-wrap gap-1">{chips}</div> : null}
      {prs.length > 0 ? (
        // Its own size query: how much a chip says follows the room this row has, not the screen.
        <div className="@container/prs flex flex-wrap items-center gap-x-2 gap-y-1">
          <DigestPrChips
            prs={prs}
            repoLabel={digestRepoLabeler(graph.changeRequests.map((pr) => pr.repo))}
          />
          <DigestAgentDots claims={claims} nowMs={nowMs} />
        </div>
      ) : null}
    </div>
  );
}

export function DigestItemRow({
  ticket,
  why,
  graph,
  nowMs,
  onOpenTicket,
  dependencies = true,
}: {
  ticket: ProjectTicket;
  why?: string | undefined;
  graph: DigestGraph;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
  /** Off inside a story card, whose adjacent-work pills carry the blocks and the people. */
  dependencies?: boolean;
}) {
  const action = digestActionLine(graph, ticket.id);
  const actions = digestItemActions(graph, ticket.id, nowMs);
  const claims = graph.claims.filter((c) => c.ticketId === ticket.id);
  const hasPrs = digestPrsFor(graph, ticket.id).length > 0;
  const dots = claims.length > 0 ? <DigestAgentDots claims={claims} nowMs={nowMs} /> : null;
  // The key/title anchors keep their href so middle-click / open-in-new-tab still work; when a
  // host handler is present we intercept the left click instead of navigating.
  const onAnchorClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (onOpenTicket) {
      e.preventDefault();
      onOpenTicket(ticket.id);
    }
  };
  return (
    <div
      className="group min-w-0 cursor-pointer px-3 py-2 hover:bg-accent/30"
      onClick={() =>
        onOpenTicket ? onOpenTicket(ticket.id) : window.open(ticket.ref.url, "_blank", "noopener")
      }
    >
      <div className="flex items-center gap-2">
        <JiraIssueTypeIcon
          issueType={ticket.issueType}
          issueTypeIconUrl={ticket.issueTypeIconUrl}
          className="size-3.5 shrink-0"
        />
        <a
          href={ticket.ref.url}
          className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={onAnchorClick}
        >
          {ticket.ref.displayId}
        </a>
        {/* flex-1 + min-w-0: the title takes the slack and wraps (two lines, then ellipsis;
            break-words splits an unbroken key-like token), instead of collapsing to nothing when
            the unshrinkable key / status / people cells crowd a narrow card. */}
        <a
          href={ticket.ref.url}
          className="line-clamp-2 min-w-0 flex-1 break-words text-left text-sm font-medium leading-5 hover:underline"
          onClick={onAnchorClick}
        >
          {ticket.ref.title}
        </a>
        <DigestProjectChip graph={graph} projectId={ticket.projectId} />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <DigestStatusDot status={ticket.status} />
          <DigestPeoplePills ticket={ticket} viewerName={graph.viewer.name} />
        </span>
      </div>
      {action || why ? (
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <div className="min-w-0 space-y-0.5">
            {action ? (
              <p className="break-words text-xs leading-4 text-foreground/80">
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
            {why ? (
              <p className="break-words text-xs leading-4 text-muted-foreground">{why}</p>
            ) : null}
          </div>
          {/* No PR row to carry the dots, so they trail the text instead of floating on their
              own line. */}
          {hasPrs ? null : <span className="shrink-0">{dots}</span>}
        </div>
      ) : null}
      {/* empty:hidden — a row with no chips must not keep a blank line under its title. */}
      <div className="mt-1 min-w-0 empty:hidden">
        <DigestChips graph={graph} ticketId={ticket.id} nowMs={nowMs} claims={claims} />
        {hasPrs || action || why || !dots ? null : <span className="inline-flex">{dots}</span>}
      </div>
      {dependencies ? <DigestDependencyLine graph={graph} ticketId={ticket.id} /> : null}
      <DigestItemActions actions={actions} />
    </div>
  );
}
