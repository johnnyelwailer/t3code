/**
 * One project's half of the digest: its mirror tickets, sprints, transitions
 * and pull requests, joined against the app-wide thread reads the loader did
 * once for every project (see `t3team-myworkDigest.ts`).
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { T3TeamBacklogCacheIdentity } from "./t3team-atlassian-backlog-cacheShared.ts";
import { readDigestStatusTransitionsSince } from "./t3team-digestStatusTransitions.ts";
import { resolveDigestTicketRef } from "./t3team-myworkDigestAggregation.ts";
import { loadDigestBurndownContext } from "./t3team-myworkDigestBurndownBackfill.ts";
import { kickDigestMirrorSync, readDigestJiraSyncedAtMs } from "./t3team-myworkDigestFreshness.ts";
import { toDigestPrEntries } from "./t3team-myworkDigestPr.ts";
import { loadDigestPrEntries, loadDigestViewerPrEntries } from "./t3team-myworkDigestPrCache.ts";
import { viewerPrsForProject } from "./t3team-myworkDigestViewerPrs.ts";
import { enrichDigestReviewEntries } from "./t3team-myworkDigestReviewEnrich.ts";
import {
  readDigestEstimateUnit,
  type DigestThreadRow,
  type readDigestPendingDecisions,
} from "./t3team-myworkDigestQueries.ts";
import { alignDigestSprints, readDigestSprints } from "./t3team-myworkDigestSprints.ts";
import type {
  T3TeamDigestClaim,
  T3TeamDigestDecision,
  T3TeamDigestProjectSource,
  T3TeamMyWorkDigestProjectInput,
} from "./t3team-myworkDigestTypes.ts";
import { readDigestDependencies } from "./t3team-myworkDigestDependencies.ts";
import { readDigestViewerTickets } from "./t3team-myworkDigestViewer.ts";

const DIGEST_TRANSITION_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/** The app-scoped reads every project joins against. */
type DigestSharedReads = {
  readonly nowMs: number;
  readonly nowIso: string;
  readonly requestedViewerName: string | undefined;
  readonly threads: ReadonlyArray<DigestThreadRow>;
  readonly agentByThread: ReadonlyMap<string, string>;
  readonly rawTicketByThread: ReadonlyMap<string, string>;
  readonly pendingRuns: Effect.Success<ReturnType<typeof readDigestPendingDecisions>>;
  readonly questions: ReadonlyMap<string, string>;
};

/** Wall-clock millis → ISO string, via Effect's DateTime (byte-identical to the legacy toISOString). */
function millisToIso(ms: number): string {
  return DateTime.formatIso(DateTime.makeUnsafe(ms));
}

export function loadDigestProjectSource(
  ctx: DigestSharedReads,
  project: T3TeamMyWorkDigestProjectInput,
) {
  return Effect.gen(function* () {
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
      requestedViewerName: ctx.requestedViewerName,
    });
    const { viewerName } = viewer;
    const boardSprints = yield* readDigestSprints(identity);
    const { tickets, sprints } = alignDigestSprints(viewer.tickets, boardSprints, ctx.nowMs);
    const estimateUnit = yield* readDigestEstimateUnit(identity);
    const transitions = yield* readDigestStatusTransitionsSince({
      ...identity,
      sinceMs: ctx.nowMs - DIGEST_TRANSITION_LOOKBACK_MS,
    });
    const { read: prRead, pending: projectPrsPending } = yield* loadDigestPrEntries(appProjectId);
    const viewerPrs = yield* loadDigestViewerPrEntries();
    const jiraSyncedAtMs = yield* readDigestJiraSyncedAtMs(project);
    const dependencies = yield* readDigestDependencies({ identity, assigned: viewer.assigned });

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
        : ctx.threads.filter(
            (thread) =>
              thread.projectId === appProjectId && ctx.rawTicketByThread.has(thread.threadId),
          )
    ).map((thread) => ({
      threadId: thread.threadId,
      threadTitle: thread.title,
      ticketRef: resolveDigestTicketRef(ctx.rawTicketByThread.get(thread.threadId), tickets),
      agent: ctx.agentByThread.get(thread.threadId) ?? "agent",
      lastActivityAt: thread.updatedAt,
    }));

    const decisions: T3TeamDigestDecision[] = ctx.pendingRuns
      .filter(
        (run) =>
          run.pendingThreadId !== null &&
          run.projectId === appProjectId &&
          ctx.rawTicketByThread.has(run.pendingThreadId),
      )
      .map((run) => ({
        id: run.pendingCorrelationId as string,
        threadId: run.pendingThreadId as string,
        // TODO(digest): requiredRole has no structured source yet; the
        // ask payload does not carry it, the client contract expects one.
        ticketRef: resolveDigestTicketRef(
          ctx.rawTicketByThread.get(run.pendingThreadId as string),
          tickets,
        ),
        question: ctx.questions.get(run.runId) ?? "",
        askedAt: run.updatedAt,
      }));

    const reviewRead = yield* enrichDigestReviewEntries(
      viewerPrsForProject({
        viewerEntries: viewerPrs.read,
        projectEntries: toDigestPrEntries(prRead),
        ticketDisplayIds: tickets.map((ticket) => ticket.displayId),
      }),
      appProjectId,
    );
    const pending = projectPrsPending || viewerPrs.pending || reviewRead.pending;

    const source: T3TeamDigestProjectSource = {
      input: project,
      tickets,
      threadTickets: claims.map((claim) => ({
        threadId: claim.threadId,
        ticketRef: claim.ticketRef,
      })),
      claims,
      decisions,
      prEntries: reviewRead.entries,
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
      nowIso: ctx.nowIso,
      ...(prRead?.note !== undefined ? { changeRequestNote: prRead.note } : {}),
      ...(jiraSyncedAtMs !== undefined ? { jiraSyncedAt: millisToIso(jiraSyncedAtMs) } : {}),
      ...(dependencies.length > 0 ? { dependencies } : {}),
    };
    return { source, viewerUnresolved: viewer.unresolved, changeRequestsPending: pending };
  });
}
