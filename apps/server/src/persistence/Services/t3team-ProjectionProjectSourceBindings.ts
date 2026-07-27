/**
 * ProjectionProjectSourceBindingRepository - persistence for a project's
 * durable work-source binding (Atlassian/Jira/etc.) so it survives a fresh
 * state dir instead of living only in browser localStorage.
 *
 * @module ProjectionProjectSourceBindingRepository
 */
import { IsoDateTime, ProjectId, ProjectSourceBinding } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

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
