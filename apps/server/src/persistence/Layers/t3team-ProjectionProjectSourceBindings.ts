import { ProjectId } from "@t3tools/contracts";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  fromProjectSourceBindingDomain,
  toProjectSourceBindingDomain,
} from "../t3team-projectSourceBindingRowMapping.ts";
import {
  DeleteProjectionProjectSourceBindingInput,
  ProjectionProjectSourceBinding,
  ProjectionProjectSourceBindingRepository,
  type ProjectionProjectSourceBindingRepositoryShape,
} from "../Services/t3team-ProjectionProjectSourceBindings.ts";

const ProjectSourceBindingDbRow = Schema.Struct({
  projectId: ProjectId,
  provider: Schema.String,
  accountId: Schema.NullOr(Schema.String),
  externalProjectId: Schema.NullOr(Schema.String),
  externalProjectKey: Schema.NullOr(Schema.String),
  externalProjectUrl: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
});
type ProjectSourceBindingDbRow = typeof ProjectSourceBindingDbRow.Type;

function toDomainRow(row: ProjectSourceBindingDbRow): ProjectionProjectSourceBinding {
  return {
    projectId: row.projectId,
    source: toProjectSourceBindingDomain(row),
    updatedAt: row.updatedAt,
  };
}

const makeProjectionProjectSourceBindingRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: ProjectionProjectSourceBinding,
    execute: (row) => {
      const flat = fromProjectSourceBindingDomain(row.source);
      return sql`
        INSERT INTO t3team_project_source_bindings (
          project_id, provider, account_id, external_project_id,
          external_project_key, external_project_url, updated_at
        )
        VALUES (
          ${row.projectId}, ${flat.provider}, ${flat.accountId}, ${flat.externalProjectId},
          ${flat.externalProjectKey}, ${flat.externalProjectUrl}, ${row.updatedAt}
        )
        ON CONFLICT (project_id)
        DO UPDATE SET
          provider = excluded.provider,
          account_id = excluded.account_id,
          external_project_id = excluded.external_project_id,
          external_project_key = excluded.external_project_key,
          external_project_url = excluded.external_project_url,
          updated_at = excluded.updated_at
      `;
    },
  });

  const deleteRow = SqlSchema.void({
    Request: DeleteProjectionProjectSourceBindingInput,
    execute: ({ projectId }) =>
      sql`DELETE FROM t3team_project_source_bindings WHERE project_id = ${projectId}`,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectSourceBindingDbRow,
    execute: () =>
      sql`
        SELECT
          project_id AS "projectId",
          provider,
          account_id AS "accountId",
          external_project_id AS "externalProjectId",
          external_project_key AS "externalProjectKey",
          external_project_url AS "externalProjectUrl",
          updated_at AS "updatedAt"
        FROM t3team_project_source_bindings
        ORDER BY project_id ASC
      `,
  });

  const upsert: ProjectionProjectSourceBindingRepositoryShape["upsert"] = (row) =>
    upsertRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionProjectSourceBindingRepository.upsert:query"),
      ),
    );

  const deleteById: ProjectionProjectSourceBindingRepositoryShape["deleteById"] = (input) =>
    deleteRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionProjectSourceBindingRepository.deleteById:query"),
      ),
    );

  const listAll: ProjectionProjectSourceBindingRepositoryShape["listAll"] = () =>
    listRows().pipe(
      Effect.map((rows) => rows.map(toDomainRow)),
      Effect.mapError(
        toPersistenceSqlError("ProjectionProjectSourceBindingRepository.listAll:query"),
      ),
    );

  return {
    upsert,
    deleteById,
    listAll,
  } satisfies ProjectionProjectSourceBindingRepositoryShape;
});

export const ProjectionProjectSourceBindingRepositoryLive = Layer.effect(
  ProjectionProjectSourceBindingRepository,
  makeProjectionProjectSourceBindingRepository,
);
