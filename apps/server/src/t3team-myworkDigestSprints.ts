/**
 * Which sprint is "now" for the digest, and what each ticket's sprint really is.
 *
 * Two ways the mirror lies about sprints, both seen on a live profile:
 *
 * - A ticket's sprint stamp is written when the TICKET syncs. Starting or
 *   closing a sprint does not touch its issues, so a ticket keeps saying
 *   "active" for a sprint that closed weeks ago. The board sprint lists are
 *   refetched with every view, so they win over the stamp.
 * - Teams that plan by calendar never press Start: the sprint they are in
 *   stays "future" for its whole run. A non-closed sprint whose dates contain
 *   today is the current one; one that ended days ago is over either way.
 *
 * Every consumer (header, burndown, "up next this sprint") reads "the active
 * sprint", so the digest hands them effective states instead of raw ones.
 */

import type { AtlassianBacklogSprint } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import {
  parseJson,
  type BacklogResourceRef,
  type T3TeamBacklogCacheIdentity,
} from "./t3team-atlassian-backlog-cacheShared.ts";

type SprintStampedTicket = BacklogResourceRef & {
  readonly sprintId?: string;
  readonly sprintName?: string;
  readonly sprintState?: string;
  readonly sprintBoardId?: string;
  readonly sprintGoal?: string;
  readonly sprintStartDate?: string;
  readonly sprintEndDate?: string;
};

/**
 * Every board's sprint list this project has cached, newest view first. One
 * view row only carries the board it last showed — on a multi-board project
 * that is routinely another team's.
 */
export function readDigestSprints(identity: T3TeamBacklogCacheIdentity) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly sprintsJson: string }>`
      SELECT sprints_json AS "sprintsJson"
      FROM t3team_atlassian_backlog_views
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
      ORDER BY updated_at DESC
    `;
    const byId = new Map<string, AtlassianBacklogSprint>();
    for (const row of rows) {
      for (const sprint of parseJson<AtlassianBacklogSprint[]>(row.sprintsJson) ?? []) {
        if (!byId.has(sprint.id)) byId.set(sprint.id, sprint);
      }
    }
    return [...byId.values()];
  }).pipe(Effect.orElseSucceed((): AtlassianBacklogSprint[] => []));
}

const SPRINT_CLOSE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function effectiveState(
  sprint: Pick<AtlassianBacklogSprint, "state" | "startDate" | "endDate">,
  nowMs: number,
): string | undefined {
  const state = sprint.state?.toLowerCase();
  if (state !== "future" && state !== "active") return sprint.state;
  const start = Date.parse(sprint.startDate ?? "");
  const end = Date.parse(sprint.endDate ?? "");
  // Long past its end, an open sprint is a stale record (a stamp nobody refreshed, a board list
  // that stopped carrying it), not where the work is; a few days late is a team closing late.
  if (end + SPRINT_CLOSE_GRACE_MS < nowMs) return "closed";
  return state === "future" && start <= nowMs && nowMs < end ? "active" : sprint.state;
}

/** Board truth over ticket stamps, calendar over an unpressed Start button. */
function alignTicket(
  ticket: SprintStampedTicket,
  boardById: ReadonlyMap<string, AtlassianBacklogSprint>,
  nowMs: number,
): SprintStampedTicket {
  if (ticket.sprintId === undefined) return ticket;
  const board = boardById.get(ticket.sprintId);
  const sprintState = effectiveState(
    board ?? {
      ...(ticket.sprintState !== undefined ? { state: ticket.sprintState } : {}),
      ...(ticket.sprintStartDate !== undefined ? { startDate: ticket.sprintStartDate } : {}),
      ...(ticket.sprintEndDate !== undefined ? { endDate: ticket.sprintEndDate } : {}),
    },
    nowMs,
  );
  return {
    ...ticket,
    ...(board !== undefined ? { sprintName: board.name } : {}),
    ...(board?.goal !== undefined ? { sprintGoal: board.goal } : {}),
    ...(board?.startDate !== undefined ? { sprintStartDate: board.startDate } : {}),
    ...(board?.endDate !== undefined ? { sprintEndDate: board.endDate } : {}),
    ...(sprintState !== undefined ? { sprintState } : {}),
  };
}

/**
 * Tickets restamped with their sprint's effective state, and the sprint list
 * with the viewer's current sprint first — the one most of their items sit in.
 * Every consumer takes "the first active sprint", so ordering is the fix.
 */
export function alignDigestSprints(
  tickets: ReadonlyArray<BacklogResourceRef>,
  boardSprints: ReadonlyArray<AtlassianBacklogSprint>,
  nowMs: number,
): {
  readonly tickets: ReadonlyArray<BacklogResourceRef>;
  readonly sprints: ReadonlyArray<AtlassianBacklogSprint>;
} {
  const sprints = boardSprints.map((sprint) => {
    const state = effectiveState(sprint, nowMs);
    return state === sprint.state ? sprint : { ...sprint, ...(state ? { state } : {}) };
  });
  const boardById = new Map(sprints.map((sprint) => [sprint.id, sprint]));
  const aligned = (tickets as ReadonlyArray<SprintStampedTicket>).map((ticket) =>
    alignTicket(ticket, boardById, nowMs),
  );
  const counts = new Map<string, { count: number; ticket: SprintStampedTicket }>();
  for (const ticket of aligned) {
    if (ticket.sprintId === undefined || ticket.sprintState?.toLowerCase() !== "active") continue;
    const entry = counts.get(ticket.sprintId);
    counts.set(ticket.sprintId, { count: (entry?.count ?? 0) + 1, ticket });
  }
  const top = [...counts.entries()].toSorted((a, b) => b[1].count - a[1].count)[0];
  if (top === undefined) return { tickets: aligned, sprints };
  const [sprintId, { ticket }] = top;
  const viewerSprint: AtlassianBacklogSprint = boardById.get(sprintId) ?? {
    id: sprintId,
    name: ticket.sprintName ?? sprintId,
    state: "active",
    ...(ticket.sprintBoardId !== undefined ? { boardId: ticket.sprintBoardId } : {}),
    ...(ticket.sprintGoal !== undefined ? { goal: ticket.sprintGoal } : {}),
    ...(ticket.sprintStartDate !== undefined ? { startDate: ticket.sprintStartDate } : {}),
    ...(ticket.sprintEndDate !== undefined ? { endDate: ticket.sprintEndDate } : {}),
  };
  return {
    tickets: aligned,
    sprints: [viewerSprint, ...sprints.filter((sprint) => sprint.id !== sprintId)],
  };
}
