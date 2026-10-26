import type { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

import { useProjects } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";

import { resolveCloudThreadProjectTitle } from "./t3team-cloudThreadProjectTitle";
import { useIsCloudSessionEnvironment } from "./t3team-useIsCloudSessionEnvironment";

/** The project's title for display: a cloud thread's project shows the user's own project title. */
export function useCloudThreadProjectTitle(project: EnvironmentProject | null): string | undefined {
  const isCloudSession = useIsCloudSessionEnvironment(project?.environmentId ?? null);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projects = useProjects();
  if (project === null) return undefined;
  return (
    resolveCloudThreadProjectTitle({ project, isCloudSession, primaryEnvironmentId, projects }) ??
    project.title
  );
}
