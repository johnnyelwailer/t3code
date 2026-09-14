#!/usr/bin/env node
/**
 * One-time replay: `thread_task_records` → `turn.plan.updated` activities.
 *
 * The task journal (migration t3team-056, written by `t3team.task.write`) is
 * removed from the server: plans are provider-native — each provider
 * translates its own todo tool into a `turn.plan.updated` runtime event, and
 * the nexplore pack ships a `todo` tool translated the same way (shared/packs/
 * nexplore-global/pi-plan.ts + pi-translator.ts). Without this replay, live
 * threads' journal rows vanish when t3team-057 drops the table.
 *
 * WHY A SCRIPT AND NOT A MIGRATION: a migration hand-writing
 * `orchestration_events` rows would bypass the decider (no `requireThread`
 * check, no command receipt, no settlement semantics). This script
 * dispatches the SAME `thread.activity.append` command the engine accepts at
 * runtime, so each event is journaled with a real stream version and receipt
 * and projected by the real pipeline — the path a live provider plan takes.
 * Re-runnable while the table exists: it deletes nothing, and each re-run
 * replaces the plan (latest-wins). Run it LAST, just before deploying the
 * t3team-057 build: the source is read first, and the engine connection then
 * auto-runs pending migrations, so the final run applies the drop itself.
 *
 * Safety: source table read READ-ONLY; writes only via the engine; a
 * `VACUUM INTO` backup precedes the first write (precedent: t3-sqlite-state
 * exec); plan activities never wake a settled thread, and WAL + busy_timeout
 * serialize with a live server.
 *
 * Usage: node apps/server/scripts/t3team-replay-task-records-to-plans.ts [--dry-run] [--base-dir DIR] (default ~/.t3)
 */
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import { parseArgs } from "node:util";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { CommandId, EventId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as PathService from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { OrchestrationEngineService } from "../src/orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationProjectionPipeline } from "../src/orchestration/Services/ProjectionPipeline.ts";
import * as ServerConfig from "../src/config.ts";
import { makeTaskReplayLiveLayers } from "./t3team-replay-task-records-layers.ts";

type TaskRecordRow = {
  readonly threadId: string;
  readonly status: string;
  readonly subject: string;
};

type PlanStep = { readonly step: string; readonly status: "pending" | "inProgress" | "completed" };

/** Same mapping the removed journal tool used: closed states read completed. */
const toPlanStatus = (status: string): PlanStep["status"] =>
  status === "in_progress" ? "inProgress" : status === "completed" || status === "cancelled" ? "completed" : "pending";

const READ_SOURCE = `
  SELECT thread_id AS "threadId", status AS "status", subject AS "subject"
  FROM thread_task_records ORDER BY thread_id, position
`;

/** All ids here come from this database (UUIDs); quote-escape anyway. */
const inList = (ids: readonly string[]): string => ids.map((id) => `'${id.replaceAll("'", "''")}'`).join(", ");

const program = Effect.gen(function* () {
  const { values } = parseArgs({
    allowPositionals: false,
    strict: true,
    options: {
      "base-dir": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  const dryRun = values["dry-run"] === true;
  const baseDir = values["base-dir"] ?? `${NodeOS.homedir()}/.t3`;
  const dbPath = NodePath.join(baseDir, "userdata", "state.sqlite");

  // --- 1. Read the source rows READ-ONLY. --------------------------------
  const source = yield* Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.unsafe<TaskRecordRow>(READ_SOURCE).unprepared;
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: dbPath, readonly: true })));

  if (source.length === 0) {
    console.log(`No thread_task_records rows at ${dbPath} — nothing to replay.`);
    return;
  }
  const byThread = new Map<string, TaskRecordRow[]>();
  for (const row of source) byThread.set(row.threadId, [...(byThread.get(row.threadId) ?? []), row]);
  const threads = [...byThread.entries()].map(([threadId, rows]) => ({
    threadId, plan: rows.map((row) => ({ step: row.subject, status: toPlanStatus(row.status) })) as PlanStep[],
  }));
  console.log(`Replaying ${source.length} row(s) across ${threads.length} thread(s) → turn.plan.updated activities.`);
  if (dryRun) {
    for (const { threadId, plan } of threads) {
      console.log(`\n${threadId}:\n  ${plan.map((s) => `[${s.status}] ${s.step}`).join("\n  ")}`);
    }
    console.log("\n--dry-run: no writes performed.");
    return;
  }

  // --- 2. Engine + pipeline against the real base dir. deriveServerPaths
  // requires the Path service, so it runs where PathService.layer is provided.
  const withConfig = Effect.gen(function* () {
    const derived = yield* ServerConfig.deriveServerPaths(baseDir, undefined);
    const config = ServerConfig.make({
      logLevel: "Info", traceMinLevel: "Info", traceTimingEnabled: false, traceBatchWindowMs: 200,
      traceMaxBytes: 10 * 1024 * 1024, traceMaxFiles: 10, otlpTracesUrl: undefined, otlpMetricsUrl: undefined,
      otlpExportIntervalMs: 10_000, otlpServiceName: "t3-server", cwd: process.cwd(), baseDir,
      ...derived, mode: "web", autoBootstrapProjectFromCwd: false, logWebSocketEvents: false,
      tailscaleServeEnabled: false, tailscaleServePort: 443, port: 0, host: undefined,
      desktopBootstrapToken: undefined, desktopTelemetryFd: undefined, desktopTelemetryControlFd: undefined,
      resourceMonitorPath: undefined, staticDir: undefined, devUrl: undefined, devAllowedOrigins: [],
      noBrowser: false, startupPresentation: "browser",
    });

    const runReplay = Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const engine = yield* OrchestrationEngineService;
      const pipeline = yield* OrchestrationProjectionPipeline;

      // Keep only threads that actually exist; dispatching a deleted thread's
      // activity would be rejected by the decider anyway.
      const live = yield* sql.unsafe<{ readonly threadId: string }>(
        `SELECT thread_id AS "threadId" FROM projection_threads WHERE thread_id IN (${inList(threads.map((t) => t.threadId))})`,
      ).unprepared;
      const liveIds = new Set(live.map((row) => row.threadId));
      const replayable = threads.filter((t) => liveIds.has(t.threadId));
      const skipped = threads.filter((t) => !liveIds.has(t.threadId)).map((t) => t.threadId);
      if (skipped.length > 0) {
        console.warn(`Skipping ${skipped.length} thread(s) no longer in projection_threads: ${skipped.join(", ")}`);
      }
      if (replayable.length === 0) {
        console.log("No replayable threads — nothing written.");
        return;
      }
      const backupPath = `${dbPath}.backup-task-replay-${new Date().toISOString().replaceAll(":", "-")}`;
      yield* sql`VACUUM INTO ${backupPath}`;
      console.log(`Backup written to ${backupPath}`);

      const nowIso = new Date().toISOString();
      let written = 0;
      for (const { threadId, plan } of replayable) {
        const activity: OrchestrationThreadActivity = {
          id: EventId.make(NodeCrypto.randomUUID()), tone: "info", kind: "turn.plan.updated",
          summary: "Plan updated", payload: { plan }, turnId: null, createdAt: nowIso,
        };
        yield* engine.dispatch({
          type: "thread.activity.append",
          commandId: CommandId.make(`server:task-record-replay:${NodeCrypto.randomUUID()}`),
          threadId, activity, createdAt: nowIso,
        });
        written++;
      }
      console.log(`Dispatched ${written} thread.activity.append command(s).`);

      // Project the new events (the same bootstrap a server boot performs).
      yield* pipeline.bootstrap;

      // Read-only verification: latest plan activity per thread.
      const verify = yield* sql.unsafe<{ readonly threadId: string; readonly planJson: string }>(
        `SELECT p.thread_id AS "threadId", p.payload_json AS "planJson"
        FROM projection_thread_activities p
        WHERE p.kind = 'turn.plan.updated'
          AND p.activity_id = (SELECT p2.activity_id FROM projection_thread_activities p2
            WHERE p2.thread_id = p.thread_id AND p2.kind = 'turn.plan.updated'
            ORDER BY p2.created_at DESC, p2.activity_id DESC LIMIT 1)
          AND p.thread_id IN (${inList(replayable.map((t) => t.threadId))})`,
      ).unprepared;
      console.log("\nVerification (latest turn.plan.updated activity per thread):");
      for (const row of verify) {
        const plan = (JSON.parse(row.planJson) as { plan?: PlanStep[] }).plan ?? [];
        console.log(`${row.threadId}: ${plan.length} step(s) — ${plan.map((s) => `[${s.status}] ${s.step}`).join("; ")}`);
      }
      console.log(
        "\nDone. Re-run to pick up new rows; start the t3team-057 build (drops the table) only afterwards.",
      );
    });

    yield* runReplay.pipe(Effect.provide(makeTaskReplayLiveLayers(config)));
  });

  yield* withConfig.pipe(Effect.provide(PathService.layer));
});

if (import.meta.main) {
  // Cause.pretty crashes on some cause shapes in this effect beta, so report
  // via squash + plain stack; runMain still prints its own summary.
  const reported = program.pipe(
    Effect.tapDefect((cause) =>
      Effect.sync(() => {
        try {
          const error = Cause.squash(cause);
          console.error("DEFECT:", error?.stack ?? String(error));
        } catch {
          /* fall back to runMain's report */
        }
      }),
    ),
  );
  NodeRuntime.runMain(reported, { disableLoggerFactory: true });
}
