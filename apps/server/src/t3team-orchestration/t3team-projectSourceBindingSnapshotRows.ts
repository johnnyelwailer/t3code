/**
 * Raw-SQL companion query for `ProjectionSnapshotQuery.ts`. That file queries
 * projection tables directly (rather than through repository services), so
 * this mirrors that convention instead of introducing a new Layer
 * dependency into `OrchestrationProjectionSnapshotQueryLive`.
 */
import { ProjectId, type ProjectSourceBinding } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError, type ProjectionRepositoryError } from "../../persistence/Errors.ts";
import { toProjectSourceBindingDomain } from "../../persistence/t3team-projectSourceBindingRowMapping.ts";

const ProjectSourceBindingSnapshotRow = Schema.Struct({
  projectId: ProjectId,
  provider: Schema.String,
  accountId: Schema.NullOr(Schema.String),
  externalProjectId: Schema.NullOr(Schema.String),
  externalProjectKey: Schema.NullOr(Schema.String),
  externalProjectUrl: Schema.NullOr(Schema.String),
});

/**
 * Loads every project's work-source binding, keyed by project id, for
 * joining into shell/read-model rows. Absent from the map means "no
 * binding" (the caller must not default to `local` — omit `source`).
 */
export function queryProjectSourceBindingsByProjectId(
  sql: SqlClient.SqlClient,
): Effect.Effect<Map<ProjectId, ProjectSourceBinding>, ProjectionRepositoryError> {
  const findAll = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectSourceBindingSnapshotRow,
    execute: () =>
      sql`
        SELECT
          project_id AS "projectId",
          provider,
          account_id AS "accountId",
          external_project_id AS "externalProjectId",
          external_project_key AS "externalProjectKey",
          external_project_url AS "externalProjectUrl"
        FROM t3team_project_source_bindings
      `,
  });

  return findAll().pipe(
    Effect.map(
      (rows) =>
        new Map(rows.map((row) => [row.projectId, toProjectSourceBindingDomain(row)] as const)),
    ),
    Effect.mapError(
      toPersistenceSqlError(
        "t3team-projectSourceBindingSnapshotRows:queryProjectSourceBindingsByProjectId",
      ),
    ),
  );
}
