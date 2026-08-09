import type {
  OrchestrationCommand,
  OrchestrationReadModel,
  ProjectId,
  ProjectSourceBinding,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { OrchestrationCommandInvariantError } from "./Errors.ts";

/**
 * Rejects a `project.create` / `project.meta.update` command that would bind
 * a project to a non-local work source already claimed by another active
 * project. No-op when `source` is absent (nothing to claim) or `local` (no
 * external identity to collide on).
 */
export function requireProjectSourceBindingUnclaimed(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly source: ProjectSourceBinding | undefined;
  readonly exceptProjectId?: ProjectId;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  const { source } = input;
  if (source === undefined || source.provider === "local") {
    return Effect.void;
  }

  const colliding = input.readModel.projects.find(
    (project) =>
      project.deletedAt === null &&
      project.id !== input.exceptProjectId &&
      project.source !== undefined &&
      project.source.provider !== "local" &&
      project.source.provider === source.provider &&
      project.source.accountId === source.accountId &&
      project.source.externalProjectId === source.externalProjectId,
  );
  if (colliding === undefined) {
    return Effect.void;
  }
  return Effect.fail(
    new OrchestrationCommandInvariantError({
      commandType: input.command.type,
      detail: `Work source '${source.provider}:${source.accountId}/${source.externalProjectId}' is already bound to project '${colliding.id}'.`,
    }),
  );
}
