import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { runMigrations } from "../Migrations.ts";
import { ServerConfig } from "../../config.ts";

/**
 * SQLite journal modes operators may select. WAL is the default and is best for
 * local/desktop performance, but it relies on shared-memory mmap that is
 * unsupported on networked filesystems (e.g. Azure Files SMB), where it
 * surfaces as "database is locked". On such mounts, set
 * `T3CODE_SQLITE_JOURNAL_MODE=DELETE` (single-replica deployments don't need
 * WAL's concurrency). The value is interpolated directly into a PRAGMA (which
 * cannot be parameter-bound), so it MUST stay constrained to this allowlist to
 * avoid SQL injection.
 */
const JournalMode = Schema.Literals(["WAL", "DELETE", "TRUNCATE", "PERSIST", "MEMORY"]);
type JournalMode = typeof JournalMode.Type;

const journalModeConfig: Config.Config<JournalMode> = Config.schema(
  JournalMode,
  "T3CODE_SQLITE_JOURNAL_MODE",
).pipe(Config.withDefault("WAL" as JournalMode));

type RuntimeSqliteLayerConfig = {
  readonly filename: string;
  readonly spanAttributes?: Record<string, unknown>;
};

type Loader = {
  layer: (config: RuntimeSqliteLayerConfig) => Layer.Layer<SqlClient.SqlClient, SqlError>;
};
const defaultSqliteClientLoaders = {
  bun: () => import("@effect/sql-sqlite-bun/SqliteClient"),
  node: () => import("../NodeSqliteClient.ts"),
} satisfies Record<string, () => Promise<Loader>>;

const makeRuntimeSqliteLayer = Effect.fn("makeRuntimeSqliteLayer")(function* (
  config: RuntimeSqliteLayerConfig,
) {
  const runtime = process.versions.bun !== undefined ? "bun" : "node";
  const loader = defaultSqliteClientLoaders[runtime];
  const clientModule = yield* Effect.promise<Loader>(loader);
  return clientModule.layer(config);
}, Layer.unwrap);

const setup = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // Invalid journal-mode config is an operator misconfiguration; fail fast.
    const journalMode = yield* Effect.orDie(journalModeConfig);
    // busy_timeout lets writers wait for transient locks instead of failing
    // immediately — important on networked filesystems with slower fsync.
    yield* sql`PRAGMA busy_timeout = 5000;`;
    // journalMode is constrained to the JournalMode allowlist above; PRAGMA
    // values cannot be parameter-bound, so it is interpolated as a raw fragment.
    yield* sql`PRAGMA journal_mode = ${sql.literal(journalMode)};`;
    yield* sql`PRAGMA foreign_keys = ON;`;
    yield* runMigrations();
  }),
);

export const makeSqlitePersistenceLive = Effect.fn("makeSqlitePersistenceLive")(function* (
  dbPath: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true });

  return Layer.provideMerge(
    setup,
    makeRuntimeSqliteLayer({
      filename: dbPath,
      spanAttributes: {
        "db.name": path.basename(dbPath),
        "service.name": "t3-server",
      },
    }),
  );
}, Layer.unwrap);

export const SqlitePersistenceMemory = Layer.provideMerge(
  setup,
  makeRuntimeSqliteLayer({ filename: ":memory:" }),
);

export const layerConfig = Layer.unwrap(
  Effect.map(Effect.service(ServerConfig), ({ dbPath }) => makeSqlitePersistenceLive(dbPath)),
);
