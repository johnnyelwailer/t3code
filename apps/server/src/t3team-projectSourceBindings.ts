/**
 * Project work-source bindings on V2 (critic C13): the override of
 * `ProjectSourceMutationHook` that persists a mutation's `source` into
 * `t3team_project_source_bindings` and enforces "at most one active project per
 * non-local source `(provider, accountId, externalProjectId)`".
 *
 * `ProjectService` only locks per project and per workspace root; this
 * invariant spans projects, so the check, the binding write and the project
 * command run under the fork's own lock keyed by the source. The binding is
 * written BEFORE the project command commits (and restored if it fails), so
 * the shell re-read that the project event triggers already sees it.
 *
 * - `source` absent: nothing changes (an update never clears a binding).
 * - `{provider: "local"}`: stored as an explicit local binding, no claim.
 * - `project.delete`: the binding row is removed after the delete succeeds
 *   (deletes through other paths are swept by `t3team-projectSourceEventsReactor.ts`).
 */
import type { ProjectId, ProjectSourceBinding } from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { makeKeyedSerialExecutor } from "./orchestration-v2/KeyedSerialExecutor.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { ProjectionProjectSourceBindingRepositoryLive } from "./persistence/Layers/t3team-ProjectionProjectSourceBindings.ts";
import {
  type ProjectionProjectSourceBinding,
  ProjectionProjectSourceBindingRepository,
} from "./persistence/Services/t3team-ProjectionProjectSourceBindings.ts";
import { ProjectOperationError } from "./project/ProjectService.ts";
import {
  ProjectSourceMutationHook,
  type ProjectSourceMutationHookShape,
} from "./t3team-projectSourceMutationHook.ts";

export class ProjectSourceBindingClaimedError extends Data.TaggedError(
  "ProjectSourceBindingClaimedError",
)<{ readonly source: string; readonly claimedByProjectId: ProjectId }> {
  override get message(): string {
    // Clients match "already bound to project" to explain a duplicate binding.
    return `Work source '${this.source}' is already bound to project '${this.claimedByProjectId}'.`;
  }
}

export const describeSource = (source: ProjectSourceBinding): string =>
  source.provider === "local"
    ? "local"
    : `${source.provider}:${source.accountId}/${source.externalProjectId}`;

const isProjectOperationError = Schema.is(ProjectOperationError);

/** The client-facing text of a binding claim failure, if `cause` is one. */
export const projectSourceClaimMessage = (cause: unknown): string | undefined =>
  isProjectOperationError(cause) && cause.cause instanceof ProjectSourceBindingClaimedError
    ? cause.cause.message
    : undefined;

export const makeProjectSourceMutationHook = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const bindings = yield* ProjectionProjectSourceBindingRepository;
  const projects = yield* ProjectStoreV2;
  const locks = yield* makeKeyedSerialExecutor<string>();

  const failOperation = (projectId: ProjectId) => (cause: unknown) =>
    new ProjectOperationError({ operation: "dispatch-project-command", projectId, cause });

  const findClaim = (source: ProjectSourceBinding, exceptProjectId: ProjectId) =>
    Effect.gen(function* () {
      if (source.provider === "local") return undefined;
      const rows = yield* sql<{ readonly projectId: ProjectId }>`
        SELECT project_id AS "projectId" FROM t3team_project_source_bindings
        WHERE provider = ${source.provider} AND account_id = ${source.accountId}
          AND external_project_id = ${source.externalProjectId}
          AND project_id <> ${exceptProjectId}
      `;
      for (const row of rows) {
        // A binding left behind by a deleted project is stale, not a claim.
        if (Option.isSome(yield* projects.get(row.projectId))) return row.projectId;
      }
      return undefined;
    });

  /** Claim check + binding write; returns the binding to restore if the command fails. */
  const prepare = (projectId: ProjectId, source: ProjectSourceBinding) =>
    Effect.gen(function* () {
      const claimedBy = yield* findClaim(source, projectId);
      if (claimedBy !== undefined) {
        return yield* new ProjectSourceBindingClaimedError({
          source: describeSource(source),
          claimedByProjectId: claimedBy,
        });
      }
      const previous = (yield* bindings.listAll()).find((row) => row.projectId === projectId);
      const updatedAt = DateTime.formatIso(yield* DateTime.now);
      yield* bindings.upsert({ projectId, source, updatedAt });
      return previous;
    }).pipe(Effect.mapError(failOperation(projectId)));

  const around: ProjectSourceMutationHookShape["around"] = (mutation, run) => {
    const { projectId } = mutation;
    if (mutation.type === "project.delete") {
      return run.pipe(Effect.tap(() => bindings.deleteById({ projectId }).pipe(Effect.ignore)));
    }
    const source = mutation.source;
    if (source === undefined) return run;
    const restore = (previous: ProjectionProjectSourceBinding | undefined) =>
      (previous === undefined
        ? bindings.deleteById({ projectId })
        : bindings.upsert(previous)
      ).pipe(Effect.ignore);
    const key = source.provider === "local" ? `project:${projectId}` : describeSource(source);
    return locks.withLock(
      key,
      prepare(projectId, source).pipe(
        Effect.flatMap((previous) => run.pipe(Effect.tapCause(() => restore(previous)))),
      ),
    );
  };

  return { around } satisfies ProjectSourceMutationHookShape;
});

/** The ONE hook override; register once in server.ts. */
export const T3TeamProjectSourceBindingsLive = Layer.effect(
  ProjectSourceMutationHook,
  makeProjectSourceMutationHook,
).pipe(Layer.provide(ProjectionProjectSourceBindingRepositoryLive));
