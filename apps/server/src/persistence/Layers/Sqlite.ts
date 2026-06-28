import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";
import { PgClient } from "@effect/sql-pg";

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

const databaseUrlConfig = Config.string("DATABASE_URL").pipe(
  Config.option,
  Config.map((value) =>
    value._tag === "Some" && value.value.trim().length > 0 ? value.value : undefined,
  ),
);

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
    // On networked filesystems (Azure Files SMB), even with DELETE journal mode,
    // the initial schema creation can be slow. busy_timeout allows SQLite to retry
    // instead of failing immediately on lock contentions. Using 300 seconds (5 min)
    // to tolerate slow initial sync on the network mount.
    yield* sql`PRAGMA busy_timeout = 300000;`;
    // journalMode is constrained to the JournalMode allowlist above; PRAGMA
    // values cannot be parameter-bound, so it is interpolated as a raw fragment.
    yield* sql`PRAGMA journal_mode = ${sql.literal(journalMode)};`;
    yield* sql`PRAGMA foreign_keys = ON;`;
    yield* runMigrations();
  }),
);

const installPostgresJsonCompatibilityFns = Effect.fn("installPostgresJsonCompatibilityFns")(
  function* () {
    const sql = yield* SqlClient.SqlClient;

    // These helpers emulate the subset of SQLite JSON1 functions used by
    // historical migrations so we can run the existing migration chain on
    // PostgreSQL without rewriting every JSON expression in-place.
    yield* sql`
    CREATE OR REPLACE FUNCTION json_extract(input_text TEXT, path TEXT)
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    DECLARE
      current_json JSONB;
      result_json JSONB;
      path_parts TEXT[];
      path_body TEXT;
    BEGIN
      IF input_text IS NULL OR path IS NULL THEN
        RETURN NULL;
      END IF;

      current_json := input_text::jsonb;
      path_body := regexp_replace(path, '^\$\.?', '');
      path_parts := CASE
        WHEN path_body = '' THEN ARRAY[]::TEXT[]
        ELSE string_to_array(path_body, '.')
      END;

      result_json := current_json #> path_parts;
      IF result_json IS NULL THEN
        RETURN NULL;
      END IF;

      IF jsonb_typeof(result_json) = 'string' THEN
        RETURN result_json #>> '{}';
      END IF;

      RETURN result_json::TEXT;
    EXCEPTION
      WHEN others THEN
        RETURN NULL;
    END;
    $$;
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION json_type(input_text TEXT, path TEXT)
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    DECLARE
      extracted TEXT;
    BEGIN
      extracted := json_extract(input_text, path);
      IF extracted IS NULL THEN
        RETURN NULL;
      END IF;

      BEGIN
        RETURN jsonb_typeof(extracted::jsonb);
      EXCEPTION
        WHEN others THEN
          RETURN 'text';
      END;
    END;
    $$;
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION "json"(input_text TEXT)
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF input_text IS NULL THEN
        RETURN NULL;
      END IF;

      RETURN input_text::jsonb::TEXT;
    EXCEPTION
      WHEN others THEN
        RETURN to_jsonb(input_text)::TEXT;
    END;
    $$;
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION "json_object"(VARIADIC kv_pairs TEXT[])
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    DECLARE
      result_json JSONB := '{}'::jsonb;
      idx INTEGER := 1;
      value_json JSONB;
    BEGIN
      IF kv_pairs IS NULL OR array_length(kv_pairs, 1) IS NULL THEN
        RETURN '{}'::jsonb::TEXT;
      END IF;

      WHILE idx <= array_length(kv_pairs, 1) LOOP
        BEGIN
          value_json := kv_pairs[idx + 1]::jsonb;
        EXCEPTION
          WHEN others THEN
            value_json := to_jsonb(kv_pairs[idx + 1]);
        END;

        result_json := jsonb_set(
          result_json,
          ARRAY[kv_pairs[idx]],
          value_json,
          true
        );
        idx := idx + 2;
      END LOOP;

      RETURN result_json::TEXT;
    END;
    $$;
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION json_set(input_text TEXT, path TEXT, value_text TEXT)
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    DECLARE
      current_json JSONB;
      value_json JSONB;
      path_parts TEXT[];
      path_body TEXT;
    BEGIN
      current_json := COALESCE(input_text, '{}')::jsonb;
      path_body := regexp_replace(path, '^\$\.?', '');
      path_parts := CASE
        WHEN path_body = '' THEN ARRAY[]::TEXT[]
        ELSE string_to_array(path_body, '.')
      END;

      BEGIN
        value_json := value_text::jsonb;
      EXCEPTION
        WHEN others THEN
          value_json := to_jsonb(value_text);
      END;

      RETURN jsonb_set(current_json, path_parts, value_json, true)::TEXT;
    EXCEPTION
      WHEN others THEN
        RETURN input_text;
    END;
    $$;
  `;

    // PostgreSQL may type SQLite-style json(...) expressions as json/jsonb.
    // Provide overloads so legacy migration SQL can call json_set without
    // explicit casts.
    yield* sql`
    CREATE OR REPLACE FUNCTION json_set(input_text TEXT, path TEXT, value_json JSON)
    RETURNS TEXT
    LANGUAGE sql
    AS $$
      SELECT json_set(input_text, path, value_json::TEXT);
    $$;
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION json_set(input_text TEXT, path TEXT, value_json JSONB)
    RETURNS TEXT
    LANGUAGE sql
    AS $$
      SELECT json_set(input_text, path, value_json::TEXT);
    $$;
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION json_remove(input_text TEXT, VARIADIC paths TEXT[])
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    DECLARE
      current_json JSONB;
      path_item TEXT;
      path_parts TEXT[];
      path_body TEXT;
    BEGIN
      current_json := COALESCE(input_text, '{}')::jsonb;
      IF paths IS NULL OR array_length(paths, 1) IS NULL THEN
        RETURN current_json::TEXT;
      END IF;

      FOREACH path_item IN ARRAY paths LOOP
        path_body := regexp_replace(path_item, '^\$\.?', '');
        path_parts := CASE
          WHEN path_body = '' THEN ARRAY[]::TEXT[]
          ELSE string_to_array(path_body, '.')
        END;
        current_json := current_json #- path_parts;
      END LOOP;

      RETURN current_json::TEXT;
    END;
    $$;
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION json_patch(target_text TEXT, patch_text TEXT)
    RETURNS TEXT
    LANGUAGE sql
    AS $$
      SELECT (COALESCE(target_text, '{}')::jsonb || COALESCE(patch_text, '{}')::jsonb)::TEXT;
    $$;
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION json_group_array_step(state_json JSONB, value_text TEXT)
    RETURNS JSONB
    LANGUAGE sql
    IMMUTABLE
    AS $$
      SELECT COALESCE(state_json, '[]'::jsonb) || jsonb_build_array(
        CASE
          WHEN value_text IS NULL THEN 'null'::jsonb
          ELSE value_text::jsonb
        END
      );
    $$;
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION json_group_array_final(state_json JSONB)
    RETURNS TEXT
    LANGUAGE sql
    IMMUTABLE
    AS $$
      SELECT COALESCE(state_json, '[]'::jsonb)::TEXT;
    $$;
  `;

    yield* sql`
    DROP AGGREGATE IF EXISTS json_group_array(TEXT);
  `;

    yield* sql`
    CREATE AGGREGATE json_group_array(TEXT) (
      SFUNC = json_group_array_step,
      STYPE = JSONB,
      FINALFUNC = json_group_array_final,
      INITCOND = '[]'
    );
  `;

    yield* sql`
    DROP FUNCTION IF EXISTS json_each(TEXT);
  `;

    yield* sql`
    CREATE OR REPLACE FUNCTION json_each(input_text TEXT)
    RETURNS TABLE(key TEXT, value TEXT, type TEXT, atom TEXT)
    LANGUAGE sql
    AS $$
      SELECT
        each_item.key,
        CASE
          WHEN jsonb_typeof(each_item.value) = 'string' THEN each_item.value #>> '{}'
          ELSE each_item.value::TEXT
        END AS value,
        CASE
          WHEN jsonb_typeof(each_item.value) = 'string' THEN 'text'
          WHEN jsonb_typeof(each_item.value) = 'boolean' AND each_item.value::TEXT = 'true' THEN 'true'
          WHEN jsonb_typeof(each_item.value) = 'boolean' AND each_item.value::TEXT = 'false' THEN 'false'
          WHEN jsonb_typeof(each_item.value) = 'number' AND each_item.value::TEXT ~ '^-?[0-9]+$' THEN 'integer'
          WHEN jsonb_typeof(each_item.value) = 'number' THEN 'real'
          ELSE jsonb_typeof(each_item.value)
        END AS type,
        CASE
          WHEN jsonb_typeof(each_item.value) IN ('object', 'array') THEN NULL
          ELSE each_item.value #>> '{}'
        END AS atom
      FROM jsonb_each(COALESCE(input_text, '{}')::jsonb) AS each_item;
    $$;
  `;
  },
);

const setupPostgres = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* installPostgresJsonCompatibilityFns();
    yield* runMigrations();
  }),
);

const makePostgresPersistenceLive = (databaseUrl: string) =>
  Layer.provideMerge(setupPostgres, PgClient.layer({ url: Redacted.make(databaseUrl) }));

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
  Effect.map(Effect.service(ServerConfig), ({ dbPath, databaseUrl }) =>
    databaseUrl && databaseUrl.trim().length > 0
      ? makePostgresPersistenceLive(databaseUrl)
      : makeSqlitePersistenceLive(dbPath),
  ),
);

export const databaseUrl = databaseUrlConfig;
