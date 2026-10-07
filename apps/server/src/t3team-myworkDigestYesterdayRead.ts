/**
 * One project's "yesterday" read: the viewer's merged PRs off the shared host-wide cache, handed to
 * the same Jira-key matcher the open-PR share uses (`viewerPrsForProject`), then assembled with
 * the project's own tickets and status transitions (`t3team-myworkDigestYesterday.ts`).
 */

import * as Effect from "effect/Effect";

import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { loadDigestViewerMergedPrEntries } from "./t3team-myworkDigestPrCache.ts";
import type { T3TeamDigestTransition } from "./t3team-myworkDigestTypes.ts";
import { viewerPrsForProject } from "./t3team-myworkDigestViewerPrs.ts";
import { assembleDigestYesterday } from "./t3team-myworkDigestYesterday.ts";
import type { DigestYesterdayWindow } from "./t3team-myworkDigestYesterdayWindow.ts";

export function readDigestYesterday(input: {
  readonly window: DigestYesterdayWindow;
  /** The viewer's own tickets, and the parents the digest adds for context. */
  readonly assigned: ReadonlyArray<BacklogResourceRef>;
  readonly tickets: ReadonlyArray<BacklogResourceRef>;
  readonly transitions: ReadonlyArray<T3TeamDigestTransition>;
}) {
  return Effect.gen(function* () {
    const mergedPrs = yield* loadDigestViewerMergedPrEntries(input.window);
    const mergedEntries = viewerPrsForProject({
      viewerEntries: mergedPrs.read,
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
    return { yesterday, pending: mergedPrs.pending };
  });
}
