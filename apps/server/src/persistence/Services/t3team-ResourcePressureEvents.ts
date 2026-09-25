/**
 * ResourcePressureEventRepository - the durable journal of memory-pressure
 * level transitions (flag `NEXI_FF_RESOURCE_PRESSURE`). See migration
 * t3team-061_ResourcePressureEvents.ts for the table rationale.
 *
 * @module ResourcePressureEventRepository
 */
import type { ResourcePressureAccumulation, ResourcePressureEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

/** Keep at most this many transitions; older rows are pruned on insert. */
export const RESOURCE_PRESSURE_EVENT_RETENTION = 500;

export type ResourcePressureEventInput = Omit<ResourcePressureEvent, "id">;

export interface ResourcePressureEventRepositoryShape {
  /** Append one transition and prune beyond the retention cap. */
  readonly append: (
    event: ResourcePressureEventInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Newest-first transitions, at most `limit`. */
  readonly listRecent: (input: {
    readonly limit: number;
  }) => Effect.Effect<ReadonlyArray<ResourcePressureEvent>, ProjectionRepositoryError>;
  /** Read-only COUNT over projection_threads: live threads owning a worktree. */
  readonly readAccumulation: Effect.Effect<ResourcePressureAccumulation, ProjectionRepositoryError>;
}

export class ResourcePressureEventRepository extends Context.Service<
  ResourcePressureEventRepository,
  ResourcePressureEventRepositoryShape
>()("t3/persistence/Services/t3team-ResourcePressureEvents/ResourcePressureEventRepository") {}
