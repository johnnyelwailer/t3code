import type { ProjectShellProject } from "@t3tools/project-context";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import { ProjectAvatar } from "~/t3team/components/t3team-ProjectAvatar";
import { useLiveProjectForShellProject } from "~/t3team/hooks/t3team-useLiveProjectForShellProject";

/**
 * A Team project's icon. When a live project backs it this is the very `ProjectFavicon` the
 * sidebar's scope pills render (chosen icon, favicon or automatic monogram), so the dashboard
 * header can never show a different icon than the pill. The tracker avatar is only the fallback
 * for a project that has no live counterpart yet.
 */
export function AppProjectIcon({ project }: { project: ProjectShellProject }) {
  const liveProject = useLiveProjectForShellProject(project);
  if (liveProject) {
    return <ProjectFavicon project={liveProject} className="size-6 shrink-0" />;
  }
  return (
    <ProjectAvatar
      title={project.title}
      projectKey={project.source.externalProjectKey}
      raw={project.source.raw}
    />
  );
}
