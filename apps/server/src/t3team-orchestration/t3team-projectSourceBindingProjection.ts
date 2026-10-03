import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { ProjectionProjectSourceBindingRepositoryShape } from "../../persistence/Services/t3team-ProjectionProjectSourceBindings.ts";

/**
 * Projects a project's durable work-source binding from orchestration
 * events. Peer to `applyProjectsProjection` in `ProjectionPipeline.ts`, kept
 * as its own module/table so a fresh state dir can never observe a `local`
 * project silently carrying a stale non-local binding (or vice versa).
 *
 * - `project.created` / `project.meta-updated` with `payload.source` →
 *   upsert (a meta-update WITHOUT `source` is a no-op — the decider/projector
 *   already guarantee an absent `source` never clears an existing binding).
 * - `project.deleted` → remove the row.
 * - anything else → no-op.
 */
export function applyProjectSourceBindingProjection(
  repo: ProjectionProjectSourceBindingRepositoryShape,
): (event: OrchestrationEvent) => Effect.Effect<void, ProjectionRepositoryError> {
  return (event) => {
    switch (event.type) {
      case "project.created":
        return event.payload.source !== undefined
          ? repo.upsert({
              projectId: event.payload.projectId,
              source: event.payload.source,
              updatedAt: event.payload.updatedAt,
            })
          : Effect.void;

      case "project.meta-updated":
        return event.payload.source !== undefined
          ? repo.upsert({
              projectId: event.payload.projectId,
              source: event.payload.source,
              updatedAt: event.payload.updatedAt,
            })
          : Effect.void;

      case "project.deleted":
        return repo.deleteById({ projectId: event.payload.projectId });

      default:
        return Effect.void;
    }
  };
}
