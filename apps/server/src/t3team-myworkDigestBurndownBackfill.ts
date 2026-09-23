/**
 * The host-read half of the digest burndown backfill. The mirror's
 * status-transition table only covers its 30-day retention, but a burndown
 * needs the whole sprint — so, per sprint, we fetch the Jira issue changelog
 * (the only call in the integration that asks for `expand=changelog`) for the
 * sprint's items and cache the transitions in SQLite. Items that move
 * afterwards are in the captured-transition table, which the burndown merges.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import type {
  T3TeamBacklogCacheIdentity,
  BacklogResourceRef,
} from "./t3team-atlassian-backlog-cacheShared.ts";
import {
  readDigestBurndownBackfill,
  recordDigestBurndownBackfill,
} from "./t3team-myworkDigestBurndownBackfillCache.ts";
import type {
  T3TeamDigestTransition,
  T3TeamDigestProjectSource,
} from "./t3team-myworkDigestTypes.ts";

/** One changelog read per issue; a whole sprint fits comfortably inside. */
const BURNDOWN_BACKFILL_LIMIT = 100;

/**
 * The one host read per sprint: changelog fetch for each issue (bounded,
 * four at a time), then the cache write + marker.
 */
export function backfillDigestBurndown(
  identity: T3TeamBacklogCacheIdentity,
  sprintId: string,
  issues: ReadonlyArray<{ readonly issueId: string; readonly issueKey?: string }>,
) {
  return Effect.gen(function* () {
    const selected = issues.slice(0, BURNDOWN_BACKFILL_LIMIT);
    if (selected.length === 0) return 0;
    const provider = yield* providerForAccount(identity.accountId);
    // Only the Atlassian provider reads changelogs; mock/fixture providers skip the backfill.
    if (!("listIssueStatusChangelog" in provider)) return 0;
    const account = { id: identity.accountId, provider: identity.provider };
    const results = yield* Effect.all(
      selected.map((issue) =>
        tryAtlassianPromise(
          () =>
            provider.listIssueStatusChangelog({
              account,
              issueIdOrKey: issue.issueKey ?? issue.issueId,
            }),
          "Failed to read the Atlassian issue changelog for the digest burndown.",
        ).pipe(Effect.map((transitions) => ({ issue, transitions }))),
      ),
      { concurrency: 4 },
    );
    yield* recordDigestBurndownBackfill(
      identity,
      sprintId,
      results.flatMap((result) =>
        result.transitions.map((transition) => ({
          issueId: result.issue.issueId,
          ...(result.issue.issueKey !== undefined ? { issueKey: result.issue.issueKey } : {}),
          from: transition.from,
          to: transition.to,
          atMs: transition.atMs,
        })),
      ),
    );
    return selected.length;
  }).pipe(Effect.asVoid);
}

/**
 * Fire-and-forget backfill: a child fiber so a slow changelog walk never
 * blocks the digest round. Failures log and clear nothing — the next round
 * retries (the marker is only written on success).
 */
/** Sprints with a backfill in flight: a second poll must not fan out to Jira again. */
const inFlightBackfills = new Set<string>();

function backfillKey(identity: T3TeamBacklogCacheIdentity, sprintId: string): string {
  return `${identity.provider}|${identity.accountId}|${identity.externalProjectId}|${sprintId}`;
}

export function kickDigestBurndownBackfill(
  identity: T3TeamBacklogCacheIdentity,
  sprintId: string,
  issues: ReadonlyArray<{ readonly issueId: string; readonly issueKey?: string }>,
) {
  const key = backfillKey(identity, sprintId);
  if (inFlightBackfills.has(key)) return Effect.void;
  inFlightBackfills.add(key);
  return backfillDigestBurndown(identity, sprintId, issues).pipe(
    Effect.catch((error) =>
      Effect.logWarning("t3team: digest burndown backfill failed", {
        error: error instanceof Error ? error.message : String(error),
      }),
    ),
    Effect.ensuring(Effect.sync(() => inFlightBackfills.delete(key))),
    Effect.forkChild,
    Effect.asVoid,
  );
}

/**
 * The digest's burndown context: read the chosen sprint's backfilled history
 * and, when this round is the first for the sprint, kick the changelog
 * backfill in the background so the NEXT round carries the full history
 * (this round answers with what the captured transitions already cover).
 */
export function loadDigestBurndownContext(input: {
  readonly identity: T3TeamBacklogCacheIdentity;
  readonly tickets: ReadonlyArray<BacklogResourceRef>;
  readonly sprints: T3TeamDigestProjectSource["sprints"];
  readonly viewerName?: string;
}) {
  return Effect.gen(function* () {
    const burndownTransitions: T3TeamDigestTransition[] = [];
    if (input.viewerName === undefined || input.viewerName === "") return { burndownTransitions };
    const sprint =
      input.sprints.find((sprint) => sprint.state?.toLowerCase() === "active") ?? input.sprints[0];
    if (sprint === undefined) return { burndownTransitions };
    const backfill = yield* readDigestBurndownBackfill(input.identity, sprint.id);
    for (const row of backfill.rows) {
      burndownTransitions.push({
        ticketRef: {
          issueId: row.issueId,
          ...(row.issueKey !== null ? { issueKey: row.issueKey } : {}),
        },
        from: row.from ?? "",
        to: row.to,
        at: DateTime.formatIso(DateTime.makeUnsafe(row.atMs)),
      });
    }
    if (!backfill.ready) {
      const sprintItems = input.tickets
        .filter((ticket) => ticket.sprintId === sprint.id || ticket.sprintName === sprint.name)
        .map((ticket) => ({
          issueId: String(ticket.id),
          ...(ticket.displayId !== undefined ? { issueKey: ticket.displayId } : {}),
        }));
      if (sprintItems.length > 0) {
        yield* kickDigestBurndownBackfill(input.identity, sprint.id, sprintItems);
      }
    }
    return { burndownTransitions };
  });
}
