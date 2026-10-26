import type { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

import { useProjects } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentPresentation } from "~/state/presentation";
import { useCloudSessions } from "~/state/t3team-cloudSessions";

import { isCloudSessionEnvironment } from "./t3team-cloudSessionEnvironmentMatch";
import { resolveCloudThreadProjectTitle } from "./t3team-cloudThreadProjectTitle";

/** Whether `environmentId` is a cloud session's machine (see `isCloudSessionEnvironment`). */
export function useIsCloudSessionEnvironment(environmentId: EnvironmentId | null): boolean {
  const { presentation } = useEnvironmentPresentation(environmentId);
  const { sessions } = useCloudSessions();
  return (
    environmentId !== null &&
    isCloudSessionEnvironment({
      target: presentation?.entry.target ?? null,
      environmentId,
      sessions,
    })
  );
}

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
