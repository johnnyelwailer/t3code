#!/usr/bin/env node
/**
 * Rebuild the desktop launch snapshot on fork migration ids.
 * Stop at 127 so ids 128-130 (upstream 078-080) stay unapplied for the launch check.
 * Upstream's copy records ProjectionThreadTitleState at 52; this fork registers it at 76.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import * as NodeURL from "node:url";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../src/persistence/Migrations.ts";

const THROUGH_ID = 127;
const FIXTURE_PATH = NodeURL.fileURLToPath(
  new URL("../../../scripts/fixtures/desktop-launch/statev2.sqlite", import.meta.url),
);

interface ColumnInfo {
  readonly name: string;
  readonly notnull: number;
  readonly dflt_value: string | null;
}

interface SeedFile {
  readonly tables: ReadonlyArray<{
    readonly name: string;
    readonly rows: ReadonlyArray<Record<string, string | number | null>>;
  }>;
}

const open = (filename: string) => NodeSqliteClient.layer({ filename });

const migrate = (filename: string, throughId?: number) =>
  runMigrations(throughId === undefined ? {} : { toMigrationInclusive: throughId }).pipe(
    Effect.provide(open(filename)),
  );

const flushWal = Effect.fn("DesktopLaunchFixture.flush")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE)").unprepared;
});

function ident(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Bad SQL name: ${name}`);
  return name;
}

function insertSeed(filename: string, seed: SeedFile) {
  const db = new NodeSqlite.DatabaseSync(filename);
  try {
    db.exec("BEGIN");
    for (const table of seed.tables) {
      const columns = db
        .prepare(`PRAGMA table_info(${ident(table.name)})`)
        .all() as Array<ColumnInfo>;
      if (columns.length === 0) throw new Error(`Missing table ${table.name}`);
      const known = new Set(columns.map((column) => column.name));
      for (const row of table.rows) {
        for (const column of columns) {
          if (column.notnull === 1 && column.dflt_value === null && !(column.name in row)) {
            throw new Error(`${table.name}.${column.name} is required and missing from the seed`);
          }
        }
        const unknown = Object.keys(row).filter((name) => !known.has(name));
        if (unknown.length > 0) throw new Error(`${table.name} has no ${unknown.join(", ")}`);
        const names = Object.keys(row);
        db.prepare(
          `INSERT INTO ${ident(table.name)} (${names.map(ident).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
        ).run(...names.map((name) => row[name]));
      }
    }
    db.exec("COMMIT");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.exec("PRAGMA journal_mode = DELETE");
  } finally {
    db.close();
  }
}

const seed = JSON.parse(
  NodeFS.readFileSync(new URL("./t3team-desktop-launch.fixtures.json", import.meta.url), "utf8"),
) as SeedFile;
const workFile = NodePath.join(NodeOS.tmpdir(), `t3-desktop-launch-${process.pid}.sqlite`);
NodeFS.rmSync(workFile, { force: true });
await Effect.runPromise(migrate(workFile, THROUGH_ID));
await Effect.runPromise(flushWal().pipe(Effect.provide(open(workFile))));
insertSeed(workFile, seed);

const proof = `${workFile}.proof`;
NodeFS.copyFileSync(workFile, proof);
const applied = (await Effect.runPromise(migrate(proof))).map(([id]) => id);
const proofDb = new NodeSqlite.DatabaseSync(proof, { readOnly: true });
const titles = (
  proofDb
    .prepare("SELECT title FROM orchestration_v2_projection_threads ORDER BY title")
    .all() as Array<{
    title: string;
  }>
).map((row) => row.title);
proofDb.close();
NodeFS.rmSync(proof, { force: true });
for (const suffix of ["", "-wal", "-shm"]) NodeFS.rmSync(`${proof}${suffix}`, { force: true });
if (applied[0] !== 128 || !applied.includes(129) || !applied.includes(130)) {
  throw new Error(`Expected 128-130 to run, got ${applied.join(",")}`);
}
if (titles.join("|") !== "Release launch check|Second thread") {
  throw new Error(`Thread rows did not survive migration: ${titles.join("|")}`);
}

NodeFS.copyFileSync(workFile, FIXTURE_PATH);
NodeFS.rmSync(workFile, { force: true });
console.log(`Wrote ${FIXTURE_PATH}; remaining migrations ${applied.join(",")}`);
