import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

import { useProjects } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";

import { resolveCloudThreadProjectIdentity } from "./t3team-cloudThreadProjectTitle";
import { useIsCloudSessionEnvironment } from "./t3team-useIsCloudSessionEnvironment";

/**
 * The selected project's identity for a cloud-session thread: the user's title and the project
 * record whose icon and favicon should be drawn (the own project, so the image loads from this
 * computer). The cloud machine does not need Jira or those files.
 */
export function useCloudThreadProjectIdentity(project: EnvironmentProject | null): {
  readonly title: string | undefined;
  readonly iconProject: EnvironmentProject | null;
} {
  const isCloudSession = useIsCloudSessionEnvironment(project?.environmentId ?? null);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projects = useProjects();
  if (project === null) return { title: undefined, iconProject: null };
  const resolved = resolveCloudThreadProjectIdentity({
    project,
    isCloudSession,
    primaryEnvironmentId,
    projects,
  });
  return { title: resolved.title, iconProject: resolved.iconProject };
}
