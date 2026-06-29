import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { PgClient } from "@effect/sql-pg";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ServerConfig } from "../../config.ts";
import { migrationEntries } from "../Migrations.ts";
import { layerConfig as PersistenceLayer } from "../Layers/Sqlite.ts";

const databaseUrl = process.env.T3CODE_TEST_DATABASE_URL?.trim();
const layer = it.layer(NodeServices.layer);

const createServerConfig = () =>
  ServerConfig.of({
    databaseUrl,
    logLevel: "Info",
    traceMinLevel: "Info",
    traceTimingEnabled: true,
    traceBatchWindowMs: 200,
    traceMaxBytes: 10 * 1024 * 1024,
    traceMaxFiles: 10,
    otlpTracesUrl: undefined,
    otlpMetricsUrl: undefined,
    otlpExportIntervalMs: 10_000,
    otlpServiceName: "t3-server",
    mode: "web",
    port: 0,
    host: undefined,
    cwd: process.cwd(),
    baseDir: "/tmp/t3-postgres-migration-from-zero",
    stateDir: "/tmp/t3-postgres-migration-from-zero/userdata",
    dbPath: "/tmp/t3-postgres-migration-from-zero/userdata/state.sqlite",
    keybindingsConfigPath: "/tmp/t3-postgres-migration-from-zero/userdata/keybindings.json",
    settingsPath: "/tmp/t3-postgres-migration-from-zero/userdata/settings.json",
    providerStatusCacheDir: "/tmp/t3-postgres-migration-from-zero/caches",
    worktreesDir: "/tmp/t3-postgres-migration-from-zero/worktrees",
    attachmentsDir: "/tmp/t3-postgres-migration-from-zero/userdata/attachments",
    logsDir: "/tmp/t3-postgres-migration-from-zero/userdata/logs",
    serverLogPath: "/tmp/t3-postgres-migration-from-zero/userdata/logs/server.log",
    serverTracePath: "/tmp/t3-postgres-migration-from-zero/userdata/logs/server.trace.ndjson",
    providerLogsDir: "/tmp/t3-postgres-migration-from-zero/userdata/logs/provider",
    providerEventLogPath: "/tmp/t3-postgres-migration-from-zero/userdata/logs/provider/events.log",
    terminalLogsDir: "/tmp/t3-postgres-migration-from-zero/userdata/logs/terminals",
    anonymousIdPath: "/tmp/t3-postgres-migration-from-zero/userdata/anonymous-id",
    environmentIdPath: "/tmp/t3-postgres-migration-from-zero/userdata/environment-id",
    serverRuntimeStatePath: "/tmp/t3-postgres-migration-from-zero/userdata/server-runtime.json",
    secretsDir: "/tmp/t3-postgres-migration-from-zero/userdata/secrets",
    staticDir: undefined,
    devUrl: undefined,
    noBrowser: true,
    startupPresentation: "headless",
    desktopBootstrapToken: undefined,
    autoBootstrapProjectFromCwd: false,
    logWebSocketEvents: false,
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
  });

layer("PostgresMigrationFromZero", (it) => {
  it.effect("applies all migrations from zero on PostgreSQL when URL is configured", () =>
    Effect.gen(function* () {
      if (!databaseUrl) {
        return;
      }

      const resetDatabase = Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`DROP SCHEMA IF EXISTS public CASCADE`;
          yield* sql`CREATE SCHEMA public`;
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(databaseUrl) }))),
      );

      yield* resetDatabase;

      const rows = yield* Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{
            readonly appliedCount: number;
            readonly latestMigrationId: number | null;
          }>`
            SELECT
              CAST(COUNT(*) AS INTEGER) AS "appliedCount",
              CAST(MAX(migration_id) AS INTEGER) AS "latestMigrationId"
            FROM effect_sql_migrations
          `;
        }).pipe(
          Effect.provide(PersistenceLayer),
          Effect.provideService(ServerConfig, createServerConfig()),
        ),
      );

      const appliedCount = rows[0]?.appliedCount ?? 0;
      const latestMigrationId = rows[0]?.latestMigrationId ?? null;
      const expectedHead = migrationEntries[migrationEntries.length - 1]?.[0] ?? null;

      assert.equal(appliedCount, migrationEntries.length);
      assert.equal(latestMigrationId, expectedHead);
    }),
  );
});
