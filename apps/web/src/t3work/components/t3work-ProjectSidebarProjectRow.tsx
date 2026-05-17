import { memo } from "react";
import { useProjectResources } from "~/t3work/hooks/t3work-useProjectResources";
import { ProjectSidebarProjectRowView } from "./t3work-ProjectSidebarProjectRowView";
import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";

export function ProjectRowWithTickets(props: Omit<ProjectRowProps, "projectTickets">) {
  const { tickets } = useProjectResources(props.project);
  return <ProjectRow {...props} projectTickets={tickets} />;
}

const ProjectRow = memo(function ProjectRow(props: ProjectRowProps) {
  return <ProjectSidebarProjectRowView {...props} />;
});
