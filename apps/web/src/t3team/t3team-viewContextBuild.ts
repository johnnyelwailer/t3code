import {
  T3TEAM_VIEW_CONTEXT_MAX_ITEM_IDS,
  T3TEAM_VIEW_CONTEXT_VERSION,
  type PullRequestRef,
  type T3TeamViewContext,
  type T3TeamViewSelection,
} from "@t3tools/contracts";

import type { DigestAsideTicket } from "~/t3team/t3team-digestPrAsideStore";
import type { ReportedViewState, ReportedVisibleItems } from "~/t3team/t3team-viewContextStore";

export function selectionFromAside(
  ticket: Pick<DigestAsideTicket, "ticketId"> | null,
  pullRequest: Pick<PullRequestRef, "repository" | "number"> | null,
): T3TeamViewSelection | null {
  if (ticket) return { kind: "work-item", id: ticket.ticketId };
  if (pullRequest) {
    return { kind: "change-request", id: `${pullRequest.repository}#${pullRequest.number}` };
  }
  return null;
}

/** The context for `projectId`'s My Work view, or null when the view reports nothing for it. */
export function buildViewContext(input: {
  readonly projectId: string;
  readonly view: ReportedViewState | null;
  readonly items: ReportedVisibleItems | null;
  readonly selection: T3TeamViewSelection | null;
}): T3TeamViewContext | null {
  const { projectId, view, items, selection } = input;
  if (view === null || view.projectId !== projectId) return null;
  const ids = items?.projectId === projectId ? items.ids : [];
  return {
    version: T3TEAM_VIEW_CONTEXT_VERSION,
    surface: view.surface,
    projectId,
    selection,
    filters: view.filters,
    visibleItemIds: ids.slice(0, T3TEAM_VIEW_CONTEXT_MAX_ITEM_IDS),
    visibleItemCount: ids.length,
  };
}

const LANE_ORDER = ["side", "main", "footer"];

/** Ticket ids of the rows a resolved digest plan renders, in the order its lanes lay them out. */
export function digestVisibleTicketIds(plan: {
  readonly sections: ReadonlyArray<{
    readonly placement: string;
    readonly items: ReadonlyArray<{ readonly ticketId: string }>;
  }>;
}): string[] {
  const ids = LANE_ORDER.flatMap((placement) =>
    plan.sections
      .filter((section) => section.placement === placement)
      .flatMap((section) => section.items.map((item) => item.ticketId)),
  );
  return [...new Set(ids)];
}
