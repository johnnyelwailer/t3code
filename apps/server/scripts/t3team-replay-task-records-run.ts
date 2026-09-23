/**
 * Live half of the task-record replay script
 * (t3team-replay-task-records-to-plans.ts): build the real server config for a
 * base dir, back up the database, dispatch one `thread.activity.append` per
 * thread through the live engine, project, and verify.
 *
 * Writes only via the engine command path (decider-checked, journaled,
 * receipt'd); the pre-write `VACUUM INTO` backup follows the t3-sqlite-state
 * exec precedent.
 */
import * as NodeCrypto from "node:crypto";
import { CommandId, EventId, ThreadId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as ServerConfig from "../src/config.ts";
import { OrchestrationEngineService } from "../src/orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationProjectionPipeline } from "../src/orchestration/Services/ProjectionPipeline.ts";
import {
  decodePlanActivityPayload,
  inList,
  type PlanStep,
} from "./t3team-replay-task-records-mapping.ts";

type ThreadPlan = { readonly threadId: string; readonly plan: PlanStep[] };

/** The real server config for `baseDir`, derived through the Path service. */
export const makeTaskReplayConfig = Effect.fn("makeTaskReplayConfig")(function* (baseDir: string) {
  const derived = yield* ServerConfig.deriveServerPaths(baseDir, undefined);
  return ServerConfig.make({
    otlpHeaders: undefined,
    otlpProtocol: "http/protobuf",
    devAuthToken: undefined,
    logLevel: "Info",
    traceMinLevel: "Info",
    traceTimingEnabled: false,
    traceBatchWindowMs: 200,
    traceMaxBytes: 10 * 1024 * 1024,
    traceMaxFiles: 10,
    otlpTracesUrl: undefined,
    otlpMetricsUrl: undefined,
    otlpExportIntervalMs: 10_000,
    otlpServiceName: "t3-server",
    cwd: process.cwd(),
    baseDir,
    ...derived,
    mode: "web",
    autoBootstrapProjectFromCwd: false,
    logWebSocketEvents: false,
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
    port: 0,
    host: undefined,
    desktopBootstrapToken: undefined,
    desktopTelemetryFd: undefined,
    desktopTelemetryControlFd: undefined,
    resourceMonitorPath: undefined,
    staticDir: undefined,
    devUrl: undefined,
    devAllowedOrigins: [],
    noBrowser: false,
    startupPresentation: "browser",
  });
});

/**
 * The replay itself: keep only threads still in `projection_threads`
 * (dispatching a deleted thread's activity would be rejected by the decider
 * anyway), back up the database, dispatch, project, verify.
 */
export const runLiveReplay = (input: {
  readonly dbPath: string;
  readonly threads: readonly ThreadPlan[];
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const engine = yield* OrchestrationEngineService;
    const pipeline = yield* OrchestrationProjectionPipeline;
    const { dbPath, threads } = input;

    const live = yield* sql.unsafe<{ readonly threadId: string }>(
      `SELECT thread_id AS "threadId" FROM projection_threads WHERE thread_id IN (${inList(
        threads.map((t) => t.threadId),
      )})`,
    ).unprepared;
    const liveIds = new Set(live.map((row) => row.threadId));
    const replayable = threads.filter((t) => liveIds.has(t.threadId));
    const skipped = threads.filter((t) => !liveIds.has(t.threadId)).map((t) => t.threadId);
    if (skipped.length > 0) {
      yield* Effect.logWarning(
        `Skipping ${skipped.length} thread(s) no longer in projection_threads: ${skipped.join(", ")}`,
      );
    }
    if (replayable.length === 0) {
      yield* Effect.log("No replayable threads — nothing written.");
      return;
    }

    const nowMs = yield* Clock.currentTimeMillis;
    const nowIso = DateTime.formatIso(DateTime.makeUnsafe(nowMs));
    const backupPath = `${dbPath}.backup-task-replay-${nowIso.replaceAll(":", "-")}`;
    yield* sql`VACUUM INTO ${backupPath}`;
    yield* Effect.log(`Backup written to ${backupPath}`);

    let written = 0;
    for (const { threadId, plan } of replayable) {
      const activity: OrchestrationThreadActivity = {
        id: EventId.make(NodeCrypto.randomUUID()),
        tone: "info",
        kind: "turn.plan.updated",
        summary: "Plan updated",
        payload: { plan },
        turnId: null,
        createdAt: nowIso,
      };
      yield* engine.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make(`server:task-record-replay:${NodeCrypto.randomUUID()}`),
        threadId: ThreadId.make(threadId),
        activity,
        createdAt: nowIso,
      });
      written++;
    }
    yield* Effect.log(`Dispatched ${written} thread.activity.append command(s).`);

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
    yield* Effect.log("\nVerification (latest turn.plan.updated activity per thread):");
    for (const row of verify) {
      const payload = yield* decodePlanActivityPayload(row.planJson);
      const plan = payload.plan ?? [];
      yield* Effect.log(
        `${row.threadId}: ${plan.length} step(s) — ${plan.map((s) => `[${s.status}] ${s.step}`).join("; ")}`,
      );
    }
    yield* Effect.log(
      "\nDone. Re-run to pick up new rows; start the t3team-057 build (drops the table) only afterwards.",
    );
  });
