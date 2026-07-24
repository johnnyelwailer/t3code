import {
  ProjectBacklogOverviewFilters,
  type ProjectBacklogOverviewFiltersProps,
} from "~/t3team/t3team-ProjectBacklogOverviewFilters";

export function ProjectBacklogOverview({ ...props }: ProjectBacklogOverviewFiltersProps) {
  return <ProjectBacklogOverviewFilters {...props} />;
}
