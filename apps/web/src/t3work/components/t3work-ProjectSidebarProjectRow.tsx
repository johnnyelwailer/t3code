import { memo } from "react";
import { useProjectWorkspaceAutoSync } from "~/t3work/hooks/t3work-useProjectWorkspaceAutoSync";
import { useProjectResources } from "~/t3work/hooks/t3work-useProjectResources";
import { ProjectSidebarProjectRowView } from "./t3work-ProjectSidebarProjectRowView";
import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";

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
