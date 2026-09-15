/**
 * The personal half of the digest read: who the viewer is on this Jira account
 * and which mirror rows are theirs.
 *
 * "My Work" = the viewer's assigned issues plus their parents, off the same
 * assignee-indexed mirror read the legacy My Work view uses. Without a resolved
 * viewer (no or stale Jira session) there is nothing personal to show, and the
 * caller tells the client so instead of painting an empty digest.
 */

import * as Effect from "effect/Effect";

import { readMyWorkIssueRows } from "./t3team-atlassian-backlog-cacheQueries.ts";
import type {
  BacklogResourceRef,
  T3TeamBacklogCacheIdentity,
} from "./t3team-atlassian-backlog-cacheShared.ts";
import { resolveT3TeamAtlassianViewerAccountId } from "./t3team-atlassian-viewer-identity.ts";
import type { T3TeamMyWorkDigestProjectInput } from "./t3team-myworkDigestTypes.ts";

export type DigestViewerTickets = {
  readonly tickets: ReadonlyArray<BacklogResourceRef>;
  /**
   * The viewer's Jira display name for THIS account: the assignee the mirror
   * stamped on the viewer's own items wins (an all-projects request spans
   * accounts, so the client's single cached name is only the fallback).
   */
  readonly viewerName: string | undefined;
  /** No Jira identity could be resolved for this account this round. */
  readonly unresolved: boolean;
};

export function readDigestViewerTickets(input: {
  readonly project: T3TeamMyWorkDigestProjectInput;
  readonly identity: T3TeamBacklogCacheIdentity;
  readonly requestedViewerName: string | undefined;
}) {
  return Effect.gen(function* () {
    const viewerAccountId = yield* resolveT3TeamAtlassianViewerAccountId(
      input.project.account,
    ).pipe(Effect.catch(() => Effect.succeed(undefined)));
    const resolved = viewerAccountId !== undefined && viewerAccountId !== "";
    const projection = resolved
      ? yield* readMyWorkIssueRows({ ...input.identity, viewerAccountId })
      : { assigned: [] as BacklogResourceRef[], parents: [] as BacklogResourceRef[] };
    const viewerName =
      (projection.assigned[0]?.assignee?.trim() || undefined) ?? input.requestedViewerName;
    return {
      tickets: [...projection.assigned, ...projection.parents],
      viewerName,
      unresolved: !resolved,
    } satisfies DigestViewerTickets;
  });
}
