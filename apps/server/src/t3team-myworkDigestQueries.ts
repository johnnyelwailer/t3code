/**
 * SQL readers for the My Work Digest graph. Every read is one bounded query
 * (no per-ticket round trips): the whole-project mirror for tickets, the
 * thread projections for claims, the durable workflow run record for pending
 * decisions, and the transition table written by the mirror upsert.
 */

import { ThreadId } from "@t3tools/contracts";
import type { AtlassianBacklogSprint } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import {
  readCachedBacklogIssueRows,
  readCachedBacklogViewRow,
} from "./t3team-atlassian-backlog-cacheQueries.ts";
import {
  parseJson,
  type BacklogResourceRef,
  type T3TeamBacklogCacheIdentity,
} from "./t3team-atlassian-backlog-cacheShared.ts";
import { readTicketIdFromThreadToolContext } from "./t3team-toolBrokerStartChildToolContext.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";

export type DigestThreadRow = {
  readonly threadId: string;
  readonly projectId: string;
  readonly title: string;
  readonly updatedAt: string;
};

/**
 * Live threads of the given app projects (the claim candidates), excluding
 * deleted and ephemeral ones — the same rule thread placement applies.
 */
export function readDigestThreads(appProjectIds: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    if (appProjectIds.length === 0) return [] as DigestThreadRow[];
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<DigestThreadRow>`
      SELECT thread_id AS "threadId", project_id AS "projectId", title, updated_at AS "updatedAt"
      FROM projection_threads
      WHERE ${sql.in("project_id", appProjectIds)}
        AND deleted_at IS NULL
        AND (retention IS NULL OR retention != 'ephemeral')
    `;
  });
}

/**
 * Ticket id per thread from the durable handoff metadata (`t3team.handoff.created`),
 * for threads whose tool context is no longer in memory. Newest handoff wins.
 */
export function readDigestHandoffTickets(threadIds: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    if (threadIds.length === 0) return new Map<string, string>();
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly threadId: string; readonly ticketId: string | null }>`
      SELECT thread_id AS "threadId",
             NULLIF(TRIM(CAST(json_extract(payload_json, '$.ticketId') AS TEXT)), '') AS "ticketId"
      FROM projection_thread_activities
      WHERE kind = 't3team.handoff.created'
        AND ${sql.in("thread_id", threadIds)}
      ORDER BY created_at DESC, activity_id DESC
    `;
    const tickets = new Map<string, string>();
    for (const row of rows) {
      if (row.ticketId !== null && !tickets.has(row.threadId))
        tickets.set(row.threadId, row.ticketId);
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
    const projects = appProjectIds.map((id) => id as (typeof suspended)[number]["projectId"]);
    return suspended.filter(
      (run) =>
        run.pendingKind === "user.input" &&
        projects.includes(run.projectId) &&
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

/** All mirror issue refs of one project, parsed (the digest ticket source). */
export function readDigestTickets(identity: T3TeamBacklogCacheIdentity) {
  return Effect.gen(function* () {
    const rows = yield* readCachedBacklogIssueRows(identity);
    const tickets: BacklogResourceRef[] = [];
    for (const row of rows) {
      const parsed = parseJson<BacklogResourceRef>(row.resourceJson);
      if (parsed !== null) tickets.push(parsed);
    }
    return tickets;
  });
}
