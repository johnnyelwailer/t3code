import type { ProjectShellProject } from "@t3tools/project-context";
import { ProjectAvatar } from "./t3team-ProjectAvatar";

export function ProjectIcon({ project }: { project: ProjectShellProject }) {
  return (
    <ProjectAvatar
      title={project.title}
      projectKey={project.source.externalProjectKey}
      raw={project.source.raw}
    />
  );
}
