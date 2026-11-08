/**
 * Saves the user's machine-source choice for a project (or resets it): validates it against the
 * project's own remote, then writes `machine-source.json`.
 *
 * @module t3team-projectMachineSourceSet
 */
import {
  type ProjectId,
  ProjectMachineDiscoveryError,
  type ProjectMachineSourceSetting,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ProjectService } from "./ProjectService.ts";
import { OWN_REPOSITORY } from "./t3team-projectMachineOwnership.ts";
import { machineRepositories } from "./t3team-projectMachineRepositories.ts";
import {
  normalizeMachineSource,
  writeMachineSource,
} from "./t3team-projectMachineSourceSetting.ts";

export const setProjectMachineSource = Effect.fn("projectMachine.setSource")(function* (
  projects: ProjectService["Service"],
  projectId: ProjectId,
  source: ProjectMachineSourceSetting | null,
) {
  const project = yield* projects.getById(projectId).pipe(
    Effect.mapError(
      () =>
        new ProjectMachineDiscoveryError({
          reason: "unreadable",
          message: "The project could not be read.",
        }),
    ),
  );
  if (Option.isNone(project)) {
    return yield* new ProjectMachineDiscoveryError({
      reason: "unknown_project",
      message: "That project does not exist on this environment.",
    });
  }
  const own = (yield* machineRepositories(project.value)).find(
    (location) => location.repository === OWN_REPOSITORY,
  );
  const normalized = source === null ? { choice: null } : normalizeMachineSource(source, own?.url);
  if ("error" in normalized) {
    return yield* new ProjectMachineDiscoveryError({
      reason: "invalid_source",
      message: normalized.error,
    });
  }
  yield* writeMachineSource(project.value.workspaceRoot, normalized.choice).pipe(
    Effect.mapError(
      () =>
        new ProjectMachineDiscoveryError({
          reason: "unreadable",
          message: "The machine source could not be saved.",
        }),
    ),
  );
});
