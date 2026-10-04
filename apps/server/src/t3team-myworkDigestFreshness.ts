/**
 * What keeps the digest's Jira half truthful.
 *
 * The digest reads the whole-project mirror, and the mirror loop only lives
 * while something keeps kicking it (it idles out otherwise). The digest is My
 * Work's default lens, so it has to kick the loop itself — otherwise a viewer
 * who only ever looks at the digest reads a mirror frozen at whenever another
 * view last ran.
 *
 * The sprint the digest wears must be the VIEWER's sprint. The backlog view
 * row lists the sprints of whichever board the backlog last showed, which on a
 * multi-board project is routinely a different team's sprint — the header,
 * the burndown and its changelog backfill then all describe work that is not
 * the viewer's.
 */

import type { AtlassianBacklogSprint } from "@t3tools/integrations-atlassian";
import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { kickT3TeamAtlassianMirrorSync } from "./t3team-atlassian-backlog-mirrorSyncService.ts";
import type { T3TeamMyWorkDigestProjectInput } from "./t3team-myworkDigestTypes.ts";

/** Keep this project's mirror loop alive; a provider that cannot resolve is not the digest's failure. */
export function kickDigestMirrorSync(project: T3TeamMyWorkDigestProjectInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(project.account.id);
    if (!(provider instanceof AtlassianIntegrationProvider)) return;
    yield* kickT3TeamAtlassianMirrorSync({
      account: project.account,
      externalProjectId: project.externalProjectId,
    });
  }).pipe(Effect.ignore);
}

type SprintStampedTicket = BacklogResourceRef & {
  readonly sprintState?: string;
  readonly sprintBoardId?: string;
  readonly sprintGoal?: string;
  readonly sprintStartDate?: string;
  readonly sprintEndDate?: string;
};

/**
 * The view row's sprints with the viewer's own active sprint first — the one
 * most of their items sit in, read off the sprint the mirror stamped on each
 * item. Every consumer takes "the first active sprint", so ordering is the
 * whole fix. No active sprint among the viewer's items leaves the list as is.
 */
export function prioritizeViewerSprint(
  sprints: ReadonlyArray<AtlassianBacklogSprint>,
  tickets: ReadonlyArray<BacklogResourceRef>,
): ReadonlyArray<AtlassianBacklogSprint> {
  const counts = new Map<string, { count: number; ticket: SprintStampedTicket }>();
  for (const ticket of tickets as ReadonlyArray<SprintStampedTicket>) {
    if (ticket.sprintId === undefined || ticket.sprintState?.toLowerCase() !== "active") continue;
    const entry = counts.get(ticket.sprintId);
    counts.set(ticket.sprintId, { count: (entry?.count ?? 0) + 1, ticket });
  }
  const top = [...counts.entries()].toSorted((a, b) => b[1].count - a[1].count)[0];
  if (top === undefined) return sprints;
  const [sprintId, { ticket }] = top;
  const known = sprints.find((sprint) => sprint.id === sprintId);
  const viewerSprint: AtlassianBacklogSprint = known ?? {
    id: sprintId,
    name: ticket.sprintName ?? sprintId,
    state: "active",
    ...(ticket.sprintBoardId !== undefined ? { boardId: ticket.sprintBoardId } : {}),
    ...(ticket.sprintGoal !== undefined ? { goal: ticket.sprintGoal } : {}),
    ...(ticket.sprintStartDate !== undefined ? { startDate: ticket.sprintStartDate } : {}),
    ...(ticket.sprintEndDate !== undefined ? { endDate: ticket.sprintEndDate } : {}),
  };
  return [viewerSprint, ...sprints.filter((sprint) => sprint.id !== sprintId)];
}
