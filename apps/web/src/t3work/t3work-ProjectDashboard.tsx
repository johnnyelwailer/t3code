import { useMemo } from "react";
import { EllipsisIcon, Link2 } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { Badge } from "~/t3work/components/ui/t3work-badge";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import { SidebarTrigger } from "~/t3work/components/ui/t3work-sidebar";
import { T3SurfacePanel, t3SurfaceBackdrops } from "~/t3work/components/ui/t3work-surface";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/t3work/components/ui/t3work-menu";
import { AppProjectIcon, ProviderBadges } from "~/t3work/t3work-AppStatusBits";
import { GitHubActivitySection } from "~/t3work/t3work-GitHubActivitySection";
import { ProjectDashboardContent } from "~/t3work/t3work-ProjectDashboardContent";
import { ProjectDashboardFilterBar } from "~/t3work/t3work-ProjectDashboardFilterBar";
import { readLinkedRepositoryUrlsFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { useProjectGitHubActivity } from "~/t3work/hooks/t3work-useProjectGitHubActivity";
import { useProjectDashboardState } from "~/t3work/t3work-useProjectDashboardState";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function ProjectDashboard({
  project,
  tickets: fallbackTickets,
  onOpenTicket,
  onManageRepositories,
}: {
  project: ProjectShellProject;
  tickets: ProjectTicket[];
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onManageRepositories: (projectId: string) => void;
}) {
  const linkedRepositoryUrls = useMemo(
    () => readLinkedRepositoryUrlsFromProject(project),
    [project],
  );
  const githubActivity = useProjectGitHubActivity({
    project,
    linkedRepositoryUrls,
    enabled: true,
  });

  const {
    tickets,
    openTickets,
    inReviewTickets,
    doneTickets,
    query,
    setQuery,
    viewMode,
    setViewMode,
    groupMode,
    setGroupMode,
    statusCategory,
    setStatusCategory,
    advancedFiltersOpen,
    setAdvancedFiltersOpen,
    activeAdvancedFilterCount,
    selectedType,
    setSelectedType,
    typeOptions,
    selectedPriority,
    setSelectedPriority,
    priorityOptions,
    selectedStatus,
    setSelectedStatus,
    statusOptions,
    resetAdvancedFilters,
    filteredWorkItems,
    isHierarchyMode,
    kanbanColumns,
    parentChildGroups,
  } = useProjectDashboardState({ project, fallbackTickets });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border bg-gradient-to-b from-background to-muted/15 px-3 sm:px-5">
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <AppProjectIcon project={project} />
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <h2 className="min-w-0 truncate text-sm font-medium" title={project.title}>
            {project.title}
          </h2>
          <Menu>
            <MenuTrigger className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground">
              <EllipsisIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="start" side="bottom" className="min-w-48">
              <MenuItem onClick={() => onManageRepositories(project.id)}>
                <Link2 className="size-4" />
                Manage linked repositories
              </MenuItem>
            </MenuPopup>
          </Menu>
          <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
            {project.source.externalProjectKey}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ProviderBadges />
          <Badge variant="secondary">{tickets.length} assigned</Badge>
        </div>
      </header>

      <div className={`min-h-0 flex-1 ${t3SurfaceBackdrops.dashboardContent}`}>
        <section className="h-full min-h-0">
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-6xl p-4 sm:p-6">
              <div className="grid gap-2 border-b border-border/70 pb-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Work items", value: tickets.length },
                  { label: "Active", value: openTickets.length },
                  { label: "In review", value: inReviewTickets.length },
                  { label: "Done", value: doneTickets.length },
                ].map((metric) => (
                  <T3SurfacePanel key={metric.label} tone="soft" className="px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {metric.label}
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{metric.value}</div>
                  </T3SurfacePanel>
                ))}
              </div>

              <section className="mt-6">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">My work items</h3>
                    <p className="text-xs text-muted-foreground">
                      Jira work items with matched GitHub child activity.
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {filteredWorkItems.length} shown
                  </Badge>
                </div>

                <ProjectDashboardFilterBar
                  query={query}
                  onQueryChange={setQuery}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  groupMode={groupMode}
                  onGroupModeChange={setGroupMode}
                  statusCategory={statusCategory}
                  onStatusCategoryChange={setStatusCategory}
                  advancedFiltersOpen={advancedFiltersOpen}
                  onAdvancedFiltersOpenChange={setAdvancedFiltersOpen}
                  activeAdvancedFilterCount={activeAdvancedFilterCount}
                  selectedType={selectedType}
                  onSelectedTypeChange={setSelectedType}
                  typeOptions={typeOptions}
                  selectedPriority={selectedPriority}
                  onSelectedPriorityChange={setSelectedPriority}
                  priorityOptions={priorityOptions}
                  selectedStatus={selectedStatus}
                  onSelectedStatusChange={setSelectedStatus}
                  statusOptions={statusOptions}
                  onReset={resetAdvancedFilters}
                />

                <ProjectDashboardContent
                  filteredWorkItems={filteredWorkItems}
                  viewMode={viewMode}
                  isHierarchyMode={isHierarchyMode}
                  kanbanColumns={kanbanColumns}
                  parentChildGroups={parentChildGroups}
                  githubActivityByWorkItem={githubActivity.activityByWorkItem}
                  projectId={project.id}
                  onOpenTicket={onOpenTicket}
                />
              </section>

              <section className="mt-6">
                <GitHubActivitySection
                  title="Unmatched GitHub activity"
                  items={githubActivity.unlinkedActivityItems}
                  {...(githubActivity.warning ? { warning: githubActivity.warning } : {})}
                  {...(githubActivity.suggestedRepositoryCount > 0
                    ? { suggestedRepositoryCount: githubActivity.suggestedRepositoryCount }
                    : {})}
                  {...(githubActivity.host ? { host: githubActivity.host } : {})}
                  {...(githubActivity.account ? { account: githubActivity.account } : {})}
                />
              </section>

              {githubActivity.loading ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Refreshing GitHub activity...
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </section>
      </div>
    </div>
  );
}
