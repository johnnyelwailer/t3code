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
import {
  effectiveSprintState,
  isSprintCalendarCurrent,
  resolveCurrentSprint,
  type SprintChoice,
} from "@t3tools/integrations-atlassian/sprintResolver";
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

/** Board truth over ticket stamps; the shared resolver's verdict over raw Jira state. */
function alignTicket(
  ticket: SprintStampedTicket,
  boardById: ReadonlyMap<string, AtlassianBacklogSprint>,
  current: AtlassianBacklogSprint | undefined,
  nowMs: number,
): SprintStampedTicket {
  if (ticket.sprintId === undefined) return ticket;
  const board = boardById.get(ticket.sprintId);
  const sprintState = effectiveSprintState(
    board ?? {
      id: ticket.sprintId,
      name: ticket.sprintName ?? ticket.sprintId,
      ...(ticket.sprintState !== undefined ? { state: ticket.sprintState } : {}),
      ...(ticket.sprintBoardId !== undefined ? { boardId: ticket.sprintBoardId } : {}),
      ...(ticket.sprintStartDate !== undefined ? { startDate: ticket.sprintStartDate } : {}),
      ...(ticket.sprintEndDate !== undefined ? { endDate: ticket.sprintEndDate } : {}),
    },
    current,
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

/** A ticket stamp as a sprint record (for sprints no cached board list carries). */
function stampSprint(ticket: SprintStampedTicket): AtlassianBacklogSprint | undefined {
  if (ticket.sprintId === undefined) return undefined;
  return {
    id: ticket.sprintId,
    name: ticket.sprintName ?? ticket.sprintId,
    ...(ticket.sprintState !== undefined ? { state: ticket.sprintState } : {}),
    ...(ticket.sprintBoardId !== undefined ? { boardId: ticket.sprintBoardId } : {}),
    ...(ticket.sprintGoal !== undefined ? { goal: ticket.sprintGoal } : {}),
    ...(ticket.sprintStartDate !== undefined ? { startDate: ticket.sprintStartDate } : {}),
    ...(ticket.sprintEndDate !== undefined ? { endDate: ticket.sprintEndDate } : {}),
  };
}

/**
 * Tickets restamped with their sprint's effective state, and the sprint list
 * with the viewer's current sprint first. "Current" comes from the shared
 * resolver (@t3tools/integrations-atlassian/sprintResolver) — the same one the
 * backlog, planning space and live provider use — so every view agrees.
 * Every consumer takes "the first active sprint", so ordering is the fix.
 */
export function alignDigestSprints(
  tickets: ReadonlyArray<BacklogResourceRef>,
  boardSprints: ReadonlyArray<AtlassianBacklogSprint>,
  nowMs: number,
  explicit?: SprintChoice,
): {
  readonly tickets: ReadonlyArray<BacklogResourceRef>;
  readonly sprints: ReadonlyArray<AtlassianBacklogSprint>;
} {
  const stamped = tickets as ReadonlyArray<SprintStampedTicket>;
  const boardById = new Map(boardSprints.map((sprint) => [sprint.id, sprint]));
  const counts = new Map<string, number>();
  const known = [...boardSprints];
  for (const ticket of stamped) {
    if (ticket.sprintId === undefined) continue;
    counts.set(ticket.sprintId, (counts.get(ticket.sprintId) ?? 0) + 1);
    if (!boardById.has(ticket.sprintId)) {
      const fromStamp = stampSprint(ticket);
      if (fromStamp) {
        boardById.set(fromStamp.id, fromStamp);
        known.push(fromStamp);
      }
    }
  }
  const resolution = resolveCurrentSprint({
    sprints: known,
    nowMs,
    explicit,
    viewerIssueCounts: counts,
  });
  const chosen = resolution.sprint;
  // Only a running sprint is restamped "active"; an explicitly chosen or
  // upcoming one leads the list but keeps its own state.
  const running =
    chosen !== undefined &&
    (resolution.reason === "calendar" ||
      resolution.reason === "jira-active" ||
      isSprintCalendarCurrent(chosen, nowMs) ||
      chosen.state?.toLowerCase() === "active")
      ? chosen
      : undefined;
  const current = running;
  const sprints = boardSprints.map((sprint) => {
    const state = effectiveSprintState(sprint, current, nowMs);
    return state === sprint.state ? sprint : { ...sprint, ...(state ? { state } : {}) };
  });
  const aligned = stamped.map((ticket) => alignTicket(ticket, boardById, current, nowMs));
  if (chosen === undefined) return { tickets: aligned, sprints };
  const viewerSprint: AtlassianBacklogSprint =
    running !== undefined
      ? { ...chosen, state: "active" }
      : (sprints.find((sprint) => sprint.id === chosen.id) ?? chosen);
  return {
    tickets: aligned,
    sprints: [viewerSprint, ...sprints.filter((sprint) => sprint.id !== chosen.id)],
  };
}
