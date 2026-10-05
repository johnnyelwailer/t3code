/**
 * The My Work Digest loader: one call joins the whole graph.
 *
 * Round trips, per request: one mirror ticket read per project, one thread
 * shell snapshot + facts read, one child-metadata fallback, one suspended
 * workflow scan + one journal read, one transition read per project, and the
 * pull request list straight off the shared TTL cache (zero host calls while
 * the cache is warm). No per-ticket work.
 */

import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { loadDigestBurndownContext } from "./t3team-myworkDigestBurndownBackfill.ts";
import { toDigestPrEntries } from "./t3team-myworkDigestPr.ts";
import { loadDigestPrEntries } from "./t3team-myworkDigestPrCache.ts";
import { kickDigestMirrorSync, prioritizeViewerSprint } from "./t3team-myworkDigestFreshness.ts";
import {
  readDigestDecisionQuestions,
  readDigestEstimateUnit,
  readDigestHandoffTickets,
  readDigestPendingDecisions,
  readDigestSprints,
  readDigestThreads,
  readDigestToolContextTickets,
} from "./t3team-myworkDigestQueries.ts";
import { readDigestViewerTickets } from "./t3team-myworkDigestViewer.ts";
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
    const nowIso = DateTime.formatIso(DateTime.makeUnsafe(nowMs));
    const requestedViewerName = input.viewer?.name?.trim() || undefined;
    // Set when any project could not resolve the viewer (no Jira session): the
    // client shows "sign in" instead of a misleading empty digest.
    let viewerUnresolved = false;
    let changeRequestsPending = false;
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
    const agentByThread = new Map(threads.map((thread) => [thread.threadId, thread.agent]));
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

    const sources = yield* Effect.forEach(
      projects,
      (project) =>
        Effect.gen(function* () {
          const appProjectId = project.appProjectId?.trim() || undefined;
          const identity: T3TeamBacklogCacheIdentity = {
            provider: project.account.provider,
            accountId: project.account.id,
            externalProjectId: project.externalProjectId,
          };
          yield* kickDigestMirrorSync(project);
          const viewer = yield* readDigestViewerTickets({
            project,
            identity,
            requestedViewerName,
          });
          const { tickets, viewerName } = viewer;
          if (viewer.unresolved) viewerUnresolved = true;
          const sprints = prioritizeViewerSprint(yield* readDigestSprints(identity), tickets);
          const estimateUnit = yield* readDigestEstimateUnit(identity);
          const transitions = yield* readDigestStatusTransitionsSince({
            ...identity,
            sinceMs: nowMs - DIGEST_TRANSITION_LOOKBACK_MS,
          });
          const { read: prRead, pending } = yield* loadDigestPrEntries(appProjectId);
          if (pending) changeRequestsPending = true;

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
            prEntries: toDigestPrEntries(prRead),
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
      // Projects are independent reads; one slow host must not serialize the rest.
      { concurrency: "unbounded" },
    );

    // The mirror-resolved name (the exact string `ticket.assignee` carries, so the client's
    // `isMine` join matches) wins; the client's requested name is only the fallback.
    const resolvedViewerName =
      sources.find((source) => source.viewerName !== undefined)?.viewerName ?? requestedViewerName;
    const payload = assembleMyWorkDigestPayload({ scope: input.scope, sources });
    return {
      ...payload,
      viewer: {
        ...(resolvedViewerName !== undefined ? { name: resolvedViewerName } : {}),
        ...(viewerUnresolved ? { unresolved: true as const } : {}),
      },
      ...(changeRequestsPending ? { changeRequestsPending: true as const } : {}),
    };
  });
}

export type T3TeamMyWorkDigestResult = { readonly payload: T3TeamMyWorkDigestPayload };

/** Wall-clock millis → ISO string, via Effect's DateTime (byte-identical to the legacy toISOString). */
function millisToIso(ms: number): string {
  return DateTime.formatIso(DateTime.makeUnsafe(ms));
}
