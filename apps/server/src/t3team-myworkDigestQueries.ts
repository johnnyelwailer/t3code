/**
 * Readers for the My Work Digest graph. Every read is one bounded query
 * (no per-ticket round trips): the whole-project mirror for tickets, the V2
 * thread shell snapshot for claims, the durable workflow run record for
 * pending decisions, and the transition table written by the mirror upsert.
 */

import { ThreadId } from "@t3tools/contracts";
import type { AtlassianBacklogSprint } from "@t3tools/integrations-atlassian";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { readCachedBacklogViewRow } from "./t3team-atlassian-backlog-cacheQueries.ts";
import {
  parseJson,
  type T3TeamBacklogCacheIdentity,
} from "./t3team-atlassian-backlog-cacheShared.ts";
import { T3TeamChildThreadMetadata } from "./t3team-childThreadMetadata.ts";
import { digestAgentLabel } from "./t3team-myworkDigestAgents.ts";
import { readTicketIdFromThreadToolContext } from "./t3team-toolBrokerStartChildToolContext.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

export type DigestThreadRow = {
  readonly threadId: string;
  readonly projectId: string;
  readonly title: string;
  readonly updatedAt: string;
  /** "<Provider> · <model>" from the thread shell. */
  readonly agent: string;
};

/**
 * Active (non-archived) threads of the given app projects — the claim
 * candidates, children included — minus ephemeral helpers (fact
 * `retention: "ephemeral"`, the same rule thread placement applies). One shell
 * snapshot read and one facts read.
 */
export function readDigestThreads(appProjectIds: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    if (appProjectIds.length === 0) return [] as DigestThreadRow[];
    const threads = yield* ThreadManagementService;
    const facts = yield* T3TeamThreadFactsStore;
    const snapshot = yield* threads.getShellSnapshot({ location: "active" });
    const ephemeral = new Set(
      (yield* facts.list())
        .filter((fact) => fact.retention === "ephemeral")
        .map((fact) => fact.threadId as string),
    );
    const wanted = new Set(appProjectIds);
    return snapshot.threads
      .filter((thread) => wanted.has(thread.projectId) && !ephemeral.has(thread.id))
      .map((thread): DigestThreadRow => ({
        threadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        updatedAt: DateTime.formatIso(thread.updatedAt),
        agent: digestAgentLabel({
          providerName: thread.providerInstanceId,
          model: thread.modelSelection.model,
        }),
      }));
  });
}

/**
 * Ticket id per thread from the durable delegated-child metadata, for threads
 * whose tool context is no longer in memory.
 */
export function readDigestHandoffTickets(threadIds: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    if (threadIds.length === 0) return new Map<string, string>();
    const metadata = yield* T3TeamChildThreadMetadata;
    const tickets = new Map<string, string>();
    for (const row of yield* metadata.listByChildThreadIds(threadIds)) {
      const ticketId = row.ticketId?.trim();
      if (ticketId) tickets.set(row.childThreadId, ticketId);
    }
    return tickets;
  });
}

/** Ticket id per thread from the in-memory tool context (hot path); the
 * caller falls back to `readDigestHandoffTickets` for whatever this misses. */
export function readDigestToolContextTickets(threadIds: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const store = yield* T3TeamThreadToolContextStore;
    const tickets = new Map<string, string>();
    for (const threadId of threadIds) {
      const toolContext = yield* store.get(ThreadId.make(threadId));
      const ticketId = readTicketIdFromThreadToolContext(toolContext);
      if (ticketId !== undefined) tickets.set(threadId, ticketId);
    }
    return tickets;
  });
}

/** Sprint metadata from the newest persisted backlog view (fallback included). */
export function readDigestSprints(identity: T3TeamBacklogCacheIdentity) {
  return Effect.gen(function* () {
    const row = yield* readCachedBacklogViewRow(identity).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );
    if (row === null) return [];
    return parseJson<AtlassianBacklogSprint[]>(row.sprintsJson) ?? [];
  });
}

/**
 * Every suspended workflow parked on a user ask, narrowed to these app
 * projects. `listByStatus('suspended')` is one indexed scan; the filter keeps
 * the digest off sleeping/timer-parked runs.
 */
export function readDigestPendingDecisions(appProjectIds: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const suspended = yield* repo.listByStatus({ status: "suspended" });
    const projects = new Set<string>(appProjectIds);
    return suspended.filter(
      (run) =>
        run.pendingKind === "user.input" &&
        projects.has(run.projectId) &&
        run.pendingThreadId !== null &&
        run.pendingCorrelationId !== null,
    );
  });
}

/**
 * The question text of each parked ask, from the durable journal: the entry
 * whose correlation matches the run's pending correlation. The journal stores
 * the wire envelope verbatim, so the fields are read defensively.
 */
export function readDigestDecisionQuestions(
  decisions: ReadonlyArray<{ readonly runId: string; readonly correlationId: string }>,
) {
  return Effect.gen(function* () {
    if (decisions.length === 0) return new Map<string, string>();
    const sql = yield* SqlClient.SqlClient;
    const runIds = [...new Set(decisions.map((decision) => decision.runId))];
    const rows = yield* sql<{ readonly runId: string; readonly entryJson: string }>`
      SELECT run_id AS "runId", entry_json AS "entryJson"
      FROM workflow_journal
      WHERE ${sql.in("run_id", runIds)}
        AND correlation_id IS NOT NULL
    `;
    const wanted = new Map(decisions.map((decision) => [decision.runId, decision.correlationId]));
    const questions = new Map<string, string>();
    for (const row of rows) {
      const correlationId = wanted.get(row.runId);
      if (correlationId === undefined || questions.has(row.runId)) continue;
      const question = parseDecisionQuestionEntry(row.entryJson, correlationId);
      if (question !== undefined) questions.set(row.runId, question);
    }
    return questions;
  });
}

/** The question of one journal entry; undefined when it carries no readable ask text. */
export function parseDecisionQuestionEntry(
  entryJson: string,
  correlationId: string,
): string | undefined {
  const entry = parseJson<Record<string, unknown>>(entryJson);
  if (entry === null) return undefined;
  if (typeof entry["correlationId"] === "string" && entry["correlationId"] !== correlationId) {
    return undefined;
  }
  const envelope = (
    typeof entry["payload"] === "object" && entry["payload"] !== null ? entry["payload"] : entry
  ) as Record<string, unknown>;
  for (const field of ["question", "prompt", "text"]) {
    const value = envelope[field];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  const label = envelope["label"];
  return typeof label === "string" && label.trim() !== "" ? label : undefined;
}

/**
 * The project's estimate unit from the persisted capabilities: a configured
 * estimate field ("Story Points") means points, otherwise hours. Absent where
 * nothing has resolved the capabilities yet — the digest degrades to points,
 * which is also the default the client shows.
 */
export function readDigestEstimateUnit(identity: T3TeamBacklogCacheIdentity) {
  return Effect.gen(function* () {
    const row = yield* readCachedBacklogViewRow(identity).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );
    if (row === null) return undefined as "points" | "hours" | undefined;
    const capabilities = parseJson<{ readonly estimateFieldLabel?: string }>(row.capabilitiesJson);
    return capabilities?.estimateFieldLabel ? "points" : "hours";
  });
}
