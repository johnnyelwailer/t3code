/**
 * The My Work Digest loader: one call joins the whole graph.
 *
 * Round trips, per request: one mirror ticket read per project, one thread
 * projection read, one agents GROUP BY, one handoff fallback, one suspended
 * workflow scan + one journal read, one transition read per project, and the
 * pull request list straight off the shared TTL cache (zero host calls while
 * the cache is warm). No per-ticket work.
 */

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { readDigestThreadAgents } from "./t3team-myworkDigestAgents.ts";
import { loadDigestBurndownContext } from "./t3team-myworkDigestBurndownBackfill.ts";
import { digestPrKey, loadPrEntries } from "./t3team-myworkDigestPr.ts";
import {
  readDigestDecisionQuestions,
  readDigestEstimateUnit,
  readDigestHandoffTickets,
  readDigestPendingDecisions,
  readDigestSprints,
  readDigestThreads,
  readDigestToolContextTickets,
} from "./t3team-myworkDigestQueries.ts";
import { readMyWorkIssueRows } from "./t3team-atlassian-backlog-cacheQueries.ts";
import { resolveT3TeamAtlassianViewerAccountId } from "./t3team-atlassian-viewer-identity.ts";
import {
  assembleMyWorkDigestPayload,
  resolveDigestTicketRef,
} from "./t3team-myworkDigestAggregation.ts";
import type {
  T3TeamDigestClaim,
  T3TeamDigestDecision,
  T3TeamDigestProjectSource,
  T3TeamMyWorkDigestInput,
  T3TeamMyWorkDigestPayload,
} from "./t3team-myworkDigestTypes.ts";
import { readDigestStatusTransitionsSince } from "./t3team-digestStatusTransitions.ts";
import type { T3TeamBacklogCacheIdentity } from "./t3team-atlassian-backlog-cacheShared.ts";

const DIGEST_TRANSITION_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/** Load the whole digest for one set of scoped project entries. */
export function loadT3TeamMyWorkDigestGraph(input: T3TeamMyWorkDigestInput) {
  return Effect.gen(function* () {
    const projects = input.projects.slice(0, 10);
    const nowMs = yield* Clock.currentTimeMillis;
    const nowIso = new Date(nowMs).toISOString();
    const requestedViewerName = input.viewer?.name?.trim() || undefined;
    let resolvedViewerName: string | undefined = requestedViewerName;
    const appProjectIds = [
      ...new Set(
        projects
          .map((project) => project.appProjectId?.trim())
          .filter((id): id is string => id !== undefined && id !== ""),
      ),
    ];

    // The app-scoped reads (threads/claims/decisions) run once for the union
    // of app projects; each Jira project entry then joins them against its own
    // mirror tickets.
    const threads = yield* readDigestThreads(appProjectIds);
    const threadIds = threads.map((thread) => thread.threadId);
    const agentByThread = yield* readDigestThreadAgents(threadIds);
    const hotTickets = yield* readDigestToolContextTickets(threadIds);
    const missingThreadIds = threadIds.filter((threadId) => !hotTickets.has(threadId));
    const coldTickets =
      missingThreadIds.length > 0
        ? yield* readDigestHandoffTickets(missingThreadIds)
        : new Map<string, string>();
    const rawTicketByThread = new Map<string, string>([...hotTickets, ...coldTickets]);

    const pendingRuns = yield* readDigestPendingDecisions(appProjectIds);
    const questions = yield* readDigestDecisionQuestions(
      pendingRuns.map((run) => ({
        runId: run.runId,
        correlationId: run.pendingCorrelationId as string,
      })),
    );

    const sources = yield* Effect.all(
      projects.map((project) =>
        Effect.gen(function* () {
          const appProjectId = project.appProjectId?.trim() || undefined;
          const identity: T3TeamBacklogCacheIdentity = {
            provider: project.account.provider,
            accountId: project.account.id,
            externalProjectId: project.externalProjectId,
          };
          // "My Work" = the viewer's assigned issues plus their parents, off the
          // same assignee-indexed mirror read the legacy My Work view uses.
          // Without a resolved viewer there is nothing personal to show.
          const viewerAccountId = yield* resolveT3TeamAtlassianViewerAccountId(
            project.account,
          ).pipe(Effect.catch(() => Effect.succeed(undefined)));
          const projection =
            viewerAccountId !== undefined && viewerAccountId !== ""
              ? yield* readMyWorkIssueRows({ ...identity, viewerAccountId })
              : { assigned: [], parents: [] };
          const tickets = [...projection.assigned, ...projection.parents];
          // The viewer's Jira display name: the client's cached name, else the
          // assignee the mirror stamped on the viewer's own items.
          const viewerName =
            requestedViewerName ?? (projection.assigned[0]?.assignee?.trim() || undefined);
          if (viewerName !== undefined && resolvedViewerName === undefined) {
            resolvedViewerName = viewerName;
          }
          const sprints = yield* readDigestSprints(identity);
          const estimateUnit = yield* readDigestEstimateUnit(identity);
          const transitions = yield* readDigestStatusTransitionsSince({
            ...identity,
            sinceMs: nowMs - DIGEST_TRANSITION_LOOKBACK_MS,
          });
          const prRead = yield* loadPrEntries(appProjectId);
          const enrichments = prRead?.enrichments ?? {};

          // Burndown history: the sprint's backfilled changelog rows; when the
          // backfill has not run yet this round it is kicked in the background
          // and the NEXT round carries the full history.
          const burndownContext = yield* loadDigestBurndownContext({
            identity,
            tickets,
            sprints,
            ...(viewerName !== undefined ? { viewerName } : {}),
          });
          const burndownTransitions = burndownContext.burndownTransitions;

          const claims: T3TeamDigestClaim[] = (
            appProjectId === undefined
              ? []
              : threads.filter(
                  (thread) =>
                    thread.projectId === appProjectId && rawTicketByThread.has(thread.threadId),
                )
          ).map((thread) => ({
            threadId: thread.threadId,
            threadTitle: thread.title,
            ticketRef: resolveDigestTicketRef(rawTicketByThread.get(thread.threadId), tickets),
            agent: agentByThread.get(thread.threadId) ?? "agent",
            lastActivityAt: thread.updatedAt,
          }));

          const decisions: T3TeamDigestDecision[] = pendingRuns
            .filter(
              (run) =>
                run.pendingThreadId !== null &&
                run.projectId === appProjectId &&
                rawTicketByThread.has(run.pendingThreadId),
            )
            .map((run) => ({
              id: run.pendingCorrelationId as string,
              threadId: run.pendingThreadId as string,
              // TODO(digest): requiredRole has no structured source yet; the
              // ask payload does not carry it, the client contract expects one.
              ticketRef: resolveDigestTicketRef(
                rawTicketByThread.get(run.pendingThreadId as string),
                tickets,
              ),
              question: questions.get(run.runId) ?? "",
              askedAt: run.updatedAt,
            }));

          const source: T3TeamDigestProjectSource = {
            input: project,
            tickets,
            threadTickets: claims.map((claim) => ({
              threadId: claim.threadId,
              ticketRef: claim.ticketRef,
            })),
            claims,
            decisions,
            prEntries: (prRead?.entries ?? []).map((entry) => ({
              host: entry.host,
              repository: entry.repository,
              number: entry.number,
              title: entry.title,
              headBranch: entry.headBranch,
              state: entry.state,
              isDraft: entry.isDraft,
              updatedAt: entry.updatedAt,
              viewerReviewRequested: entry.viewerReviewRequested,
              ...(entry.reviewDecision !== undefined
                ? { reviewDecision: entry.reviewDecision }
                : {}),
              ...(entry.checksState !== undefined ? { checksState: entry.checksState } : {}),
              ...(enrichments[digestPrKey(entry)] !== undefined
                ? {
                    reviewers: enrichments[digestPrKey(entry)]!.reviewers,
                    unhandledReviewThreads: enrichments[digestPrKey(entry)]!.unhandledReviewThreads,
                    body: enrichments[digestPrKey(entry)]!.body,
                  }
                : {}),
            })),
            transitions: transitions.map((row) => ({
              ticketRef: {
                issueId: row.issueId,
                ...(row.issueKey !== null ? { issueKey: row.issueKey } : {}),
              },
              from: row.from,
              to: row.to,
              at: millisToIso(row.atMs),
            })),
            ...(burndownTransitions.length > 0 ? { burndownTransitions } : {}),
            ...(viewerName !== undefined ? { viewerName } : {}),
            ...(estimateUnit !== undefined ? { estimateUnit } : {}),
            sprints,
            nowIso,
            ...(prRead?.note !== undefined ? { changeRequestNote: prRead.note } : {}),
          };
          return source;
        }),
      ),
    );

    const payload = assembleMyWorkDigestPayload({ scope: input.scope, sources });
    return {
      ...payload,
      ...(resolvedViewerName !== undefined ? { viewer: { name: resolvedViewerName } } : {}),
    };
  });
}

export type T3TeamMyWorkDigestResult = { readonly payload: T3TeamMyWorkDigestPayload };

/** Wall-clock millis → ISO string, the one Date construction in this loader. */
function millisToIso(ms: number): string {
  return new Date(ms).toISOString();
}
