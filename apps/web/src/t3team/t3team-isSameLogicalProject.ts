import { derivePhysicalProjectKey } from "@t3tools/client-runtime/state/project-grouping";
import type { EnvironmentId } from "@t3tools/contracts";

import { getClientSettings } from "~/hooks/useSettings";
import { readProjects } from "~/state/entities";
import { buildPhysicalToLogicalProjectKeyMap } from "~/sidebarProjectGrouping";

/**
 * Whether a dragged item's Team project (an id on the primary environment) is the project a
 * thread row belongs to. On the primary environment the ids are the same space; on any other
 * environment the sidebar's own grouping decides, so a row is accepted exactly when the sidebar
 * lists it under the same project.
 */
export function isSameLogicalProject(input: {
  primaryEnvironmentId: EnvironmentId | null;
  requestProjectId: string;
  rowEnvironmentId: EnvironmentId;
  rowProjectId: string;
}): boolean {
  const { primaryEnvironmentId } = input;
  if (input.rowEnvironmentId === primaryEnvironmentId) {
    return input.rowProjectId === input.requestProjectId;
  }
  const projects = readProjects();
  const requestProject = projects.find(
    (project) =>
      project.environmentId === primaryEnvironmentId && project.id === input.requestProjectId,
  );
  const rowProject = projects.find(
    (project) =>
      project.environmentId === input.rowEnvironmentId && project.id === input.rowProjectId,
  );
  if (!requestProject || !rowProject) return false;
  const logicalKeys = buildPhysicalToLogicalProjectKeyMap({
    projects,
    settings: getClientSettings(),
    primaryEnvironmentId,
  });
  const requestKey = logicalKeys.get(derivePhysicalProjectKey(requestProject));
  return (
    requestKey !== undefined && requestKey === logicalKeys.get(derivePhysicalProjectKey(rowProject))
  );
}
