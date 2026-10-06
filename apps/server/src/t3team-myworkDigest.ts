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

import { digestYesterdayWindow } from "./t3team-myworkDigestYesterdayWindow.ts";
import { assembleMyWorkDigestPayload } from "./t3team-myworkDigestAggregation.ts";
import { loadDigestProjectSource } from "./t3team-myworkDigestProjectSource.ts";
import {
  readDigestDecisionQuestions,
  readDigestHandoffTickets,
  readDigestPendingDecisions,
  readDigestThreads,
  readDigestToolContextTickets,
} from "./t3team-myworkDigestQueries.ts";
import type {
  T3TeamMyWorkDigestInput,
  T3TeamMyWorkDigestPayload,
} from "./t3team-myworkDigestTypes.ts";

/** Load the whole digest for one set of scoped project entries. */
export function loadT3TeamMyWorkDigestGraph(input: T3TeamMyWorkDigestInput) {
  return Effect.gen(function* () {
    const projects = input.projects.slice(0, 10);
    const nowMs = yield* Clock.currentTimeMillis;
    const nowIso = DateTime.formatIso(DateTime.makeUnsafe(nowMs));
    const requestedViewerName = input.viewer?.name?.trim() || undefined;
    const yesterdayWindow = digestYesterdayWindow(nowMs, input.timeZone);
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

    const loaded = yield* Effect.forEach(
      projects,
      (project) =>
        loadDigestProjectSource(
          {
            nowMs,
            nowIso,
            requestedViewerName,
            yesterdayWindow,
            threads,
            agentByThread,
            rawTicketByThread,
            pendingRuns,
            questions,
          },
          project,
        ),
      // Projects are independent reads; one slow host must not serialize the rest.
      { concurrency: "unbounded" },
    );
    const sources = loaded.map((entry) => entry.source);
    // Set when any project could not resolve the viewer (no Jira session): the
    // client shows "sign in" instead of a misleading empty digest.
    const viewerUnresolved = loaded.some((entry) => entry.viewerUnresolved);
    const changeRequestsPending = loaded.some((entry) => entry.changeRequestsPending);

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
