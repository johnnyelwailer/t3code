/**
 * Hook around every wire project mutation (`projectMutationOperation`: WS
 * `projects.mutate`, HTTP `projects/mutate`, CLI). The default runs the
 * mutation unchanged, so upstream behaviour holds until the fork layer
 * (`t3team-projectSourceBindings.ts`) provides an override that persists the
 * mutation's work-source binding and enforces "one active project per
 * external source" under its own keyed lock.
 *
 * The override may fail only with `ProjectServiceError`, so every caller's
 * error mapping stays exhaustive.
 */
import type { ProjectMutation } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectServiceError } from "./project/ProjectService.ts";

export interface ProjectSourceMutationHookShape {
  readonly around: <A, R>(
    mutation: ProjectMutation,
    run: Effect.Effect<A, ProjectServiceError, R>,
  ) => Effect.Effect<A, ProjectServiceError, R>;
}

export class ProjectSourceMutationHook extends Context.Reference<ProjectSourceMutationHookShape>(
  "t3team/ProjectSourceMutationHook",
  { defaultValue: () => ({ around: (_mutation, run) => run }) },
) {}
