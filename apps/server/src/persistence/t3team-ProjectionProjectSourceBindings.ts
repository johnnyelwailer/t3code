/**
 * ProjectionProjectSourceBindingRepository - persistence for a project's durable work-source
 * binding (Atlassian/Jira/etc.) so it survives a fresh state dir instead of living only in
 * browser localStorage. The SQLite binding lives below the service definition.
 *
 * @module t3team.persistence.ProjectionProjectSourceBindings
 */
import { IsoDateTime, ProjectId, ProjectSourceBinding } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlSchema from "effect/sql/SqlSchema";

import { toPersistenceSqlError, type ProjectionRepositoryError } from "./Errors.ts";
import {
  fromProjectSourceBindingDomain,
  toProjectSourceBindingDomain,
} from "./t3team-projectSourceBindingRowMapping.ts";

export const ProjectionProjectSourceBinding = Schema.Struct({
  projectId: ProjectId,
  source: ProjectSourceBinding,
  updatedAt: IsoDateTime,
});
export type ProjectionProjectSourceBinding = typeof ProjectionProjectSourceBinding.Type;

export const DeleteProjectionProjectSourceBindingInput = Schema.Struct({
  projectId: ProjectId,
});
export type DeleteProjectionProjectSourceBindingInput =
  typeof DeleteProjectionProjectSourceBindingInput.Type;

/**
 * ProjectionProjectSourceBindingRepositoryShape - Service API for projected
 * work-source binding records.
 */
export interface ProjectionProjectSourceBindingRepositoryShape {
  /**
   * Insert or fully replace a project's binding row.
   */
  readonly upsert: (
    row: ProjectionProjectSourceBinding,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Remove a project's binding row (e.g. when the project is deleted).
   */
  readonly deleteById: (
    input: DeleteProjectionProjectSourceBindingInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * List all projected binding rows.
   */
  readonly listAll: () => Effect.Effect<
    ReadonlyArray<ProjectionProjectSourceBinding>,
    ProjectionRepositoryError
  >;
}

/**
 * ProjectionProjectSourceBindingRepository - Service tag for work-source
 * binding projection persistence.
 */
export class ProjectionProjectSourceBindingRepository extends Context.Service<
  ProjectionProjectSourceBindingRepository,
  ProjectionProjectSourceBindingRepositoryShape
>()(
  "t3/persistence/Services/t3team-ProjectionProjectSourceBindings/ProjectionProjectSourceBindingRepository",
) {}

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
