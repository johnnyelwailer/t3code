/**
 * Fork hook for the V1 transcript importer: which V1 message rows it imports and
 * the fork columns it reads with them.
 *
 * - The fork ext column: `t3team_ext_json` (`t3work_ext_json` on older fork
 *   builds). Databases that never ran the fork's ext migration (pure upstream
 *   copies) have neither; every fork predicate is then empty.
 * - Hidden framing rows (`visibleToUser = false`: notification/kickoff framing,
 *   reaction transports, agent-only notes) are excluded; importing them would
 *   surface machine framing to every reader of V2 messages.
 * - Besides upstream's `user`/`assistant` rows, a fork database also imports
 *   inter-agent `actor` rows and `system` notes that have text (see
 *   `t3team-legacyMessageMapping.ts`); a text-less system row (a bare widget, a
 *   draft carrier) is carried as a thread artifact by the rich-message cutover.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { Fragment } from "effect/sql/Statement";

/** The fork ext column of `projection_thread_messages`, if this database has one. */
export const readLegacyExtColumn = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_thread_messages)
  `.pipe(Effect.orElseSucceed(() => []));
  const names = new Set(columns.map((column) => column.name));
  return ["t3team_ext_json", "t3work_ext_json"].find((name) => names.has(name));
});

/** SQLite's TRIM strips only spaces by default; match JS `trim()` for the usual whitespace. */
const hasTextExpression = (column: string) =>
  `TRIM(${column}, ' ' || char(9) || char(10) || char(13)) <> ''`;

const visibleExpression = (column: string) =>
  `CASE WHEN json_valid(${column}) THEN COALESCE(json_extract(${column}, '$.visibleToUser'), 1) ELSE 1 END <> 0`;

type Alias = "message" | "earlier";

/**
 * Resolves the ext column once per importer instance. `alias` qualifies the
 * columns when the query aliases the V1 message table.
 */
export const makeLegacyMessageColumns = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const extColumn = yield* readLegacyExtColumn;
  const qualify = (alias: Alias | undefined, column: string) =>
    alias === undefined ? column : `${alias}.${column}`;
  return {
    /** `<ext column> AS t3team_ext_json` for a SELECT list (`NULL` without the column). */
    ext: (alias?: Alias): Fragment =>
      sql.literal(
        extColumn === undefined
          ? "NULL AS t3team_ext_json"
          : `${qualify(alias, extColumn)} AS t3team_ext_json`,
      ),
    /** `AND …` keeping only messages visible to the user. */
    visibleOnly: (alias?: Alias): Fragment =>
      extColumn === undefined
        ? sql.literal("")
        : sql.literal(`AND ${visibleExpression(qualify(alias, extColumn))}`),
    /** `AND …` keeping the roles the importer carries (fork roles only on a fork database). */
    importedRoles: (alias?: Alias): Fragment => {
      const role = qualify(alias, "role");
      return sql.literal(
        extColumn === undefined
          ? `AND ${role} IN ('user', 'assistant')`
          : `AND (${role} IN ('user', 'assistant', 'actor')
              OR (${role} = 'system' AND ${hasTextExpression(qualify(alias, "text"))}))`,
      );
    },
  };
});
