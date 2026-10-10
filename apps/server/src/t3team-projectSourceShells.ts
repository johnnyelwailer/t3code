/**
 * Decorates project shells with their work-source binding from
 * `t3team_project_source_bindings` (display only). `ProjectStoreV2.getShell`
 * / `listShells` call this, so every shell path (WS shell stream, HTTP shell
 * snapshot, `ProjectService`, MCP readers) carries `source` without each
 * reader joining the fork table itself.
 *
 * Never fails: a read error leaves the shells undecorated (and is logged),
 * because a missing badge must not take the project list down.
 */
import { type OrchestrationProjectShell, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/sql/SqlClient";
import * as SqlSchema from "effect/sql/SqlSchema";

import { toProjectSourceBindingDomain } from "./persistence/t3team-projectSourceBindingRowMapping.ts";

const BindingRow = Schema.Struct({
  projectId: ProjectId,
  provider: Schema.String,
  accountId: Schema.NullOr(Schema.String),
  externalProjectId: Schema.NullOr(Schema.String),
  externalProjectKey: Schema.NullOr(Schema.String),
  externalProjectUrl: Schema.NullOr(Schema.String),
});

export const attachProjectSourceBindings =
  (sql: SqlClient.SqlClient) =>
  (
    shells: ReadonlyArray<OrchestrationProjectShell>,
  ): Effect.Effect<ReadonlyArray<OrchestrationProjectShell>> => {
    if (shells.length === 0) return Effect.succeed(shells);
    const findRows = SqlSchema.findAll({
      Request: Schema.Array(ProjectId),
      Result: BindingRow,
      execute: (projectIds) => sql`
        SELECT
          project_id AS "projectId",
          provider,
          account_id AS "accountId",
          external_project_id AS "externalProjectId",
          external_project_key AS "externalProjectKey",
          external_project_url AS "externalProjectUrl"
        FROM t3team_project_source_bindings
        WHERE ${sql.in("project_id", projectIds)}
      `,
    });
    return findRows(shells.map((shell) => shell.id)).pipe(
      Effect.map((rows) => {
        if (rows.length === 0) return shells;
        const byId = new Map(rows.map((row) => [row.projectId, toProjectSourceBindingDomain(row)]));
        return shells.map((shell) => {
          const source = byId.get(shell.id);
          return source === undefined ? shell : { ...shell, source };
        });
      }),
      Effect.catchCause((cause) =>
        Effect.logWarning("project source bindings unavailable for shells", { cause }).pipe(
          Effect.as(shells),
        ),
      ),
    );
  };
