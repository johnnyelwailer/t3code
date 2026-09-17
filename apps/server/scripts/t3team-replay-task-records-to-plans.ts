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
import * as NodeOS from "node:os";
import { parseArgs } from "node:util";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as PathService from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { makeTaskReplayLiveLayers } from "./t3team-replay-task-records-layers.ts";
import {
  READ_SOURCE,
  toThreads,
  type TaskRecordRow,
} from "./t3team-replay-task-records-mapping.ts";
import { makeTaskReplayConfig, runLiveReplay } from "./t3team-replay-task-records-run.ts";

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
  const { join } = yield* PathService.Path;
  const dbPath = join(baseDir, "userdata", "state.sqlite");

  // --- 1. Read the source rows READ-ONLY. --------------------------------
  const source = yield* Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.unsafe<TaskRecordRow>(READ_SOURCE).unprepared;
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: dbPath, readonly: true })));

  if (source.length === 0) {
    yield* Effect.log(`No thread_task_records rows at ${dbPath} — nothing to replay.`);
    return;
  }
  const threads = toThreads(source);
  yield* Effect.log(
    `Replaying ${source.length} row(s) across ${threads.length} thread(s) → turn.plan.updated activities.`,
  );
  if (dryRun) {
    for (const { threadId, plan } of threads) {
      yield* Effect.log(
        `\n${threadId}:\n  ${plan.map((s) => `[${s.status}] ${s.step}`).join("\n  ")}`,
      );
    }
    yield* Effect.log("\n--dry-run: no writes performed.");
    return;
  }

  // --- 2. Engine + pipeline against the real base dir. deriveServerPaths
  // requires the Path service, so it runs where PathService.layer is provided.
  const withConfig = Effect.gen(function* () {
    const config = yield* makeTaskReplayConfig(baseDir);
    // Clock is a runtime auto-provided Context.Reference — no layer needed.
    yield* runLiveReplay({ dbPath, threads }).pipe(
      Effect.provide(makeTaskReplayLiveLayers(config)),
    );
  });

  yield* withConfig.pipe(Effect.provide(PathService.layer));
});

if (import.meta.main) {
  // Cause.pretty crashes on some cause shapes in this effect beta, so report
  // the defect plainly; runMain still prints its own summary.
  const reported = program.pipe(
    Effect.tapDefect((defect) =>
      Effect.gen(function* () {
        if (!Cause.isCause(defect)) return;
        try {
          const error = Cause.squash(defect);
          if (error instanceof Error) {
            yield* Effect.logError("DEFECT:", error.stack ?? error.message);
          } else {
            yield* Effect.logError("DEFECT:", String(error));
          }
        } catch {
          /* fall back to runMain's report */
        }
      }),
    ),
    Effect.provide(PathService.layer),
  );
  NodeRuntime.runMain(reported);
}
