#!/usr/bin/env node
// Dumps a migration-upgrade fixture from a Nexi Work / T3 Code state database:
// the schema DDL and the effect_sql_migrations ledger only. No row data is copied,
// so the fixture carries no user content.
//
//   pnpm t3team:migrations:dump-upgrade-fixture <statev2.sqlite> <out.json> [label]
//
// Run it against a database written by the previously released (pinned) fork core
// and commit the result under apps/server/src/persistence/__fixtures__/ as t3team-fork-release-<core>.fixtures.json. The
// "upgrades a database written by a previous fork release" test then migrates every
// fixture there with the current manifest, so a sync PR whose migrations cannot
// upgrade old installs fails CI.
import * as NodeSqlite from "node:sqlite";
import * as NodeFS from "node:fs";

const [source, out, label = "unlabelled"] = process.argv.slice(2);
if (!source || !out) {
  console.error("usage: t3team-dump-migration-upgrade-fixture.mjs <db> <out.json> [label]");
  process.exit(2);
}
const db = new NodeSqlite.DatabaseSync(source, { readOnly: true });
const order = { table: 0, view: 1, index: 2, trigger: 3 };
// FTS/virtual-table shadow tables are created by their CREATE VIRTUAL TABLE; replaying them fails.
const shadow = new Set(
  db
    .prepare("SELECT name FROM pragma_table_list WHERE type = 'shadow'")
    .all()
    .map((row) => row.name),
);
const statements = db
  .prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
  )
  .all()
  .filter((row) => !shadow.has(row.name))
  .sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name))
  .map((row) => row.sql);
const ledger = db
  .prepare("SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id")
  .all()
  .map((row) => [row.migration_id, row.name]);
db.close();
NodeFS.writeFileSync(out, `${JSON.stringify({ label, statements, ledger }, null, 2)}\n`);
console.log(`wrote ${statements.length} statements and ${ledger.length} ledger rows to ${out}`);
