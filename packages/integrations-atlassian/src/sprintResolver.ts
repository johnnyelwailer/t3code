/**
 * The ONE answer to "which board and sprint is current for this viewer?".
 *
 * Every surface (backlog, planning space, kanban, My Work digest, live provider,
 * cache reads) used to decide on its own — Jira "active" flag, first sprint in a
 * sorted list, the last stored view row, or "most of my issues in openSprints()".
 * Those disagree on exactly the days that matter: when a team doesn't press
 * "Complete sprint" on time, the ended sprint stays `active` in Jira while the
 * next one (`future`, dates already running) is where the work is.
 *
 * Order of precedence:
 *   0. Pool: an explicit board, else the boards holding the viewer's issues,
 *      else every board.
 *   1. The user's explicit choice (remembered per project) always wins while the
 *      sprint still exists and is not closed. An explicit board narrows the pool.
 *   2. A sprint whose calendar window contains "now" (not closed). Ties: most of
 *      the viewer's issues, then the preferred board, then Jira-active, then the
 *      most recent start.
 *   3. A Jira-active sprint that ended at most `graceMs` ago (team closing late,
 *      no successor running yet). Same tie-breaks.
 *   4. The next future sprint by start date.
 */

export type SprintLike = {
  readonly id: string;
  readonly name: string;
  readonly state?: string;
  readonly boardId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
};

export type SprintChoice = {
  readonly boardId?: string;
  readonly sprintId?: string;
};

export type SprintResolution<S extends SprintLike> = {
  readonly sprint?: S;
  readonly boardId?: string;
  readonly reason: "explicit" | "calendar" | "jira-active" | "next-future" | "none";
};

export const SPRINT_RESOLVER_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function ms(value: string | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function state(sprint: SprintLike): string {
  return sprint.state?.trim().toLowerCase() ?? "";
}

export function isSprintCalendarCurrent(sprint: SprintLike, nowMs: number): boolean {
  if (state(sprint) === "closed") return false;
  const start = ms(sprint.startDate);
  const end = ms(sprint.endDate);
  return start <= nowMs && nowMs < end;
}

/** Dedupe by id; later duplicates fill in but the first-seen record wins. */
function uniqueSprints<S extends SprintLike>(sprints: ReadonlyArray<S>): S[] {
  const byId = new Map<string, S>();
  for (const sprint of sprints) if (!byId.has(sprint.id)) byId.set(sprint.id, sprint);
  return [...byId.values()];
}

export function resolveCurrentSprint<S extends SprintLike>(input: {
  readonly sprints: ReadonlyArray<S>;
  readonly nowMs: number;
  readonly explicit?: SprintChoice | undefined;
  /** sprintId → number of the viewer's issues in it (assigned to them). */
  readonly viewerIssueCounts?: ReadonlyMap<string, number> | undefined;
  /** Board the viewer works on (e.g. default/last-viewed board). */
  readonly preferredBoardId?: string | undefined;
  readonly graceMs?: number;
}): SprintResolution<S> {
  const all = uniqueSprints(input.sprints).filter((sprint) => state(sprint) !== "closed");
  const explicitSprintId = input.explicit?.sprintId?.trim();
  const explicitBoardId = input.explicit?.boardId?.trim();
  if (explicitSprintId) {
    const chosen = all.find((sprint) => sprint.id === explicitSprintId);
    if (chosen) {
      const boardId = chosen.boardId ?? explicitBoardId;
      return { sprint: chosen, ...(boardId ? { boardId } : {}), reason: "explicit" };
    }
  }
  // Board the user is on: an explicit board first, else the boards that hold
  // the viewer's issues (another team's running sprint is not "mine").
  const onBoard = explicitBoardId ? all.filter((s) => s.boardId === explicitBoardId) : [];
  const viewerBoards = new Set(
    all
      .filter((s) => (input.viewerIssueCounts?.get(s.id) ?? 0) > 0 && s.boardId !== undefined)
      .map((s) => s.boardId),
  );
  const onViewerBoards = all.filter((s) => s.boardId !== undefined && viewerBoards.has(s.boardId));
  const pool = onBoard.length > 0 ? onBoard : onViewerBoards.length > 0 ? onViewerBoards : all;
  const preferredBoardId = explicitBoardId || input.preferredBoardId;
  const count = (sprint: S) => input.viewerIssueCounts?.get(sprint.id) ?? 0;
  const rank = (a: S, b: S) =>
    count(b) - count(a) ||
    Number(b.boardId !== undefined && b.boardId === preferredBoardId) -
      Number(a.boardId !== undefined && a.boardId === preferredBoardId) ||
    Number(state(b) === "active") - Number(state(a) === "active") ||
    (ms(b.startDate) || 0) - (ms(a.startDate) || 0) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const done = (sprint: S | undefined, reason: SprintResolution<S>["reason"]) => {
    const boardId = explicitBoardId || sprint?.boardId || input.preferredBoardId;
    return {
      ...(sprint ? { sprint } : {}),
      ...(boardId ? { boardId } : {}),
      reason: sprint ? reason : "none",
    } as SprintResolution<S>;
  };

  const calendar = pool.filter((sprint) => isSprintCalendarCurrent(sprint, input.nowMs));
  if (calendar.length > 0) return done(calendar.toSorted(rank)[0], "calendar");

  const grace = input.graceMs ?? SPRINT_RESOLVER_GRACE_MS;
  const jiraActive = pool.filter((sprint) => {
    if (state(sprint) !== "active") return false;
    const end = ms(sprint.endDate);
    return Number.isNaN(end) || end + grace >= input.nowMs;
  });
  if (jiraActive.length > 0) return done(jiraActive.toSorted(rank)[0], "jira-active");

  const future = pool
    .filter((sprint) => state(sprint) === "future" && ms(sprint.startDate) > input.nowMs)
    .toSorted((a, b) => ms(a.startDate) - ms(b.startDate) || rank(a, b));
  return done(future[0], "next-future");
}

/**
 * The effective state a surface should show for a sprint once the current one
 * is known: an open sprint that has ended is "closed" when a successor is
 * current on the same board, or once it is past the grace window; a future
 * sprint whose dates are running and that IS the current one reads "active".
 */
export function effectiveSprintState(
  sprint: SprintLike,
  current: SprintLike | undefined,
  nowMs: number,
  graceMs: number = SPRINT_RESOLVER_GRACE_MS,
): string | undefined {
  const s = state(sprint);
  if (s !== "active" && s !== "future") return sprint.state;
  if (current && sprint.id === current.id) return "active";
  const end = ms(sprint.endDate);
  if (end + graceMs < nowMs) return "closed";
  if (
    s === "active" &&
    end <= nowMs &&
    current !== undefined &&
    (current.boardId === undefined || current.boardId === sprint.boardId)
  ) {
    return "closed";
  }
  if (s === "future" && isSprintCalendarCurrent(sprint, nowMs)) return "active";
  return sprint.state;
}
