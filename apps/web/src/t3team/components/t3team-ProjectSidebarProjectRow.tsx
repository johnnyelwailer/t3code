import { memo } from "react";
import { useProjectWorkspaceAutoSync } from "~/t3team/hooks/t3team-useProjectWorkspaceAutoSync";
import { useProjectResources } from "~/t3team/hooks/t3team-useProjectResources";
import { ProjectSidebarProjectRowView } from "./t3team-ProjectSidebarProjectRowView";
import type { ProjectRowProps } from "./t3team-projectSidebarProjectRowTypes";

export function ProjectRowWithTickets(props: Omit<ProjectRowProps, "projectTickets">) {
  const { tickets, lastCheckedAt } = useProjectResources(props.project);
  useProjectWorkspaceAutoSync({ project: props.project, projectTickets: tickets });
  return (
    <ProjectRow
      {...props}
      projectTickets={tickets}
      {...(lastCheckedAt !== undefined ? { jiraLastCheckedAt: lastCheckedAt } : {})}
    />
  );
}

const ProjectRow = memo(function ProjectRow(props: ProjectRowProps) {
  return <ProjectSidebarProjectRowView {...props} />;
});
