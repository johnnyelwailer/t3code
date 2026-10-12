/**
 * One project's "yesterday" recap: the project's share of the viewer's merged PRs off the shared
 * host-wide read (`viewerPrsForProject`, the same Jira-key matcher the open-PR share uses),
 * assembled with the project's own tickets and status transitions
 * (`t3team-myworkDigestYesterday.ts`). Pure — the merged-PR read already happened for the whole
 * data horizon, so this only matches and filters.
 */

import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { loadDigestViewerMergedPrEntries } from "./t3team-myworkDigestPrCache.ts";
import type { T3TeamDigestTransition } from "./t3team-myworkDigestTypes.ts";
import { viewerPrsForProject } from "./t3team-myworkDigestViewerPrs.ts";
import { assembleDigestYesterday } from "./t3team-myworkDigestYesterday.ts";
import type { DigestYesterdayWindow } from "./t3team-myworkDigestYesterdayWindow.ts";

export function readDigestYesterday(input: {
  readonly window: DigestYesterdayWindow;
  /** The whole-horizon merged-PR read every project filters down to its found day. */
  readonly mergedRead: Effect.Success<ReturnType<typeof loadDigestViewerMergedPrEntries>>;
  /** The viewer's own tickets, and the parents the digest adds for context. */
  readonly assigned: ReadonlyArray<BacklogResourceRef>;
  readonly tickets: ReadonlyArray<BacklogResourceRef>;
  readonly transitions: ReadonlyArray<T3TeamDigestTransition>;
}) {
  const mergedEntries = viewerPrsForProject({
    viewerEntries: input.mergedRead.read,
    projectEntries: [],
    ticketDisplayIds: input.tickets.map((ticket) => ticket.displayId),
  });
  const ticketKeys = new Set(
    input.tickets.flatMap((ticket) =>
      ticket.displayId !== undefined ? [ticket.displayId.toUpperCase()] : [],
    ),
  );
  const yesterday = assembleDigestYesterday({
    window: input.window,
    mergedEntries,
    assigned: input.assigned,
    ticketKeys,
    transitions: input.transitions,
  });
  return { yesterday, pending: input.mergedRead.pending };
}
