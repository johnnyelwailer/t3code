import { ProjectSidebarCurrentIssuesContent } from "./t3work-ProjectSidebarCurrentIssuesContent";
import { ProjectSidebarDashboardNav } from "./t3work-ProjectSidebarDashboardNav";
import { ProjectSidebarDashboardThreadList } from "./t3work-ProjectSidebarDashboardThreadList";
import { ProjectSidebarProjectHeader } from "./t3work-ProjectSidebarProjectHeader";
import { ProjectSidebarProjectThreadSection } from "./t3work-ProjectSidebarProjectThreadSection";
import { ProjectSidebarPinnedItems } from "./t3work-ProjectSidebarPinnedItems";
import { deriveProjectSidebarPinnedFeedState } from "./t3work-projectSidebarPinnedFeedState";
import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";
import { useProjectSidebarProjectRow } from "./t3work-useProjectSidebarProjectRow";
import { useProjectSidebarProjectRowPinnedState } from "./t3work-useProjectSidebarProjectRowPinnedState";
import {
  getSidebarProjectSectionState,
  getSidebarProjectState,
} from "./t3work-projectSidebarItemState";

export function ProjectSidebarProjectRowView(props: ProjectRowProps) {
  const state = useProjectSidebarProjectRow(props);
  const {
    project,
    expanded,
    projectStatus,
    view,
    activeDashboardMode,
    ticketViewMode,
    showProjectThreads,
    showMyActivityFeed,
    showJiraItems,
    showGitHubActivity,
    onSelectProjectDashboardMode,
    onSelectThread,
    onSelectTicket,
    onCreateTicketThread,
    onDeleteThread,
    onRenameThread,
  } = props;
  const projectState = getSidebarProjectState({ view, projectId: project.id });
  const backlogState = getSidebarProjectSectionState({
    activeDashboardMode,
    dashboardMode: "backlog",
    projectId: project.id,
    view,
  });
  const myWorkState = getSidebarProjectSectionState({
    activeDashboardMode,
    dashboardMode: "my-work",
    projectId: project.id,
    view,
  });
  const {
    pinnedItems,
    showPinnedOnlyFeed,
    effectiveProjectTickets,
    effectiveTicketHierarchy,
    effectiveVisibleFlatTickets,
    effectiveGitHubActivityByWorkItem,
    effectiveUnlinkedGitHubItems,
    effectiveVisibleTicketIds,
    effectiveHiddenTicketCount,
  } = useProjectSidebarProjectRowPinnedState(props, state);
  const { visiblePinnedItems, pinnedItemVisibleTicketIds, currentIssueCount, githubItems } =
    deriveProjectSidebarPinnedFeedState({
      showPinnedOnlyFeed,
      ticketViewMode,
      pinnedItems,
      effectiveProjectTickets,
      effectiveUnlinkedGitHubItems,
      effectiveVisibleTicketIds,
    });

  return (
    <>
      <ProjectSidebarProjectHeader
        project={project}
        state={projectState}
        expanded={expanded}
        projectStatus={projectStatus}
        isRenaming={state.isRenaming}
        renameInputRef={state.renameInputRef}
        renameTitle={state.renameTitle}
        setRenameTitle={state.setRenameTitle}
        onProjectClick={state.handleProjectClick}
        onContextMenu={state.handleContextMenu}
        onToggleExpand={state.handleToggleExpand}
        onRenameKeyDown={state.handleRenameKeyDown}
        onRenameSubmit={state.handleRenameSubmit}
        onNewThread={state.handleNewThread}
        onOpenMenu={state.handleOpenMenu}
      />

      {expanded ? (
        <ProjectSidebarDashboardNav
          backlogState={backlogState}
          myWorkState={myWorkState}
          myWorkExpanded={state.myWorkExpanded}
          myWorkThreadCount={showMyActivityFeed ? state.myWorkThreads.length : 0}
          pinnedItemCount={visiblePinnedItems.length}
          onMyWorkExpandedChange={state.setMyWorkExpanded}
          onSelectBacklog={() => onSelectProjectDashboardMode(project.id, "backlog")}
          onSelectMyWork={() => {
            state.setMyWorkExpanded(true);
            onSelectProjectDashboardMode(project.id, "my-work");
          }}
          backlogContent={
            <ProjectSidebarDashboardThreadList
              projectId={project.id}
              threads={state.backlogThreads}
              view={view}
              onSelectThread={onSelectThread}
              onDeleteThread={onDeleteThread}
              onRenameThread={onRenameThread}
            />
          }
          myWorkContent={
            showMyActivityFeed ? (
              <ProjectSidebarDashboardThreadList
                projectId={project.id}
                threads={state.myWorkThreads}
                view={view}
                onSelectThread={onSelectThread}
                onDeleteThread={onDeleteThread}
                onRenameThread={onRenameThread}
              />
            ) : undefined
          }
          pinnedContent={
            visiblePinnedItems.length > 0 ? (
              <ProjectSidebarPinnedItems
                project={project}
                projectTickets={props.projectTickets}
                githubActivityByWorkItem={state.githubActivityByWorkItem}
                items={visiblePinnedItems}
                view={view}
                visibleTicketIds={pinnedItemVisibleTicketIds}
                {...(props.jiraLastCheckedAt !== undefined
                  ? { jiraLastCheckedAt: props.jiraLastCheckedAt }
                  : {})}
                {...(state.githubActivityLastCheckedAt !== undefined
                  ? { githubActivityLastCheckedAt: state.githubActivityLastCheckedAt }
                  : {})}
                onSelectTicket={onSelectTicket}
              />
            ) : undefined
          }
          showMyActivityFeed={showMyActivityFeed}
          showJiraItems={showJiraItems}
          currentIssueCount={currentIssueCount}
          currentIssuesContent={
            <ProjectSidebarCurrentIssuesContent
              project={project}
              projectTickets={effectiveProjectTickets}
              ticketViewMode={ticketViewMode}
              view={view}
              visibleTreeRoots={effectiveTicketHierarchy.roots}
              visibleFlatTickets={effectiveVisibleFlatTickets}
              visibleTreeUnresolvedChildren={effectiveTicketHierarchy.unresolvedChildren}
              hiddenTicketCount={effectiveHiddenTicketCount}
              childrenByParentId={effectiveTicketHierarchy.childrenByParentId}
              ticketThreadsById={state.ticketThreadsById}
              githubActivityByWorkItem={effectiveGitHubActivityByWorkItem}
              {...(props.jiraLastCheckedAt !== undefined
                ? { jiraLastCheckedAt: props.jiraLastCheckedAt }
                : {})}
              {...(state.githubActivityLastCheckedAt !== undefined
                ? { githubActivityLastCheckedAt: state.githubActivityLastCheckedAt }
                : {})}
              showGitHubActivity={showGitHubActivity}
              onSelectTicket={onSelectTicket}
              onCreateTicketThread={onCreateTicketThread}
              onSelectThread={onSelectThread}
              onDeleteThread={onDeleteThread}
              onRenameThread={onRenameThread}
            />
          }
          showGitHubActivity={showGitHubActivity}
          githubItems={githubItems}
          {...(state.githubActivityLastCheckedAt !== undefined
            ? { githubActivityLastCheckedAt: state.githubActivityLastCheckedAt }
            : {})}
        />
      ) : null}

      {expanded && showProjectThreads && (
        <ProjectSidebarProjectThreadSection
          projectId={project.id}
          view={view}
          visibleThreads={state.visibleThreads}
          hasOverflowingThreads={state.hasOverflowingThreads}
          expandedThreadList={state.expandedThreadList}
          onExpandedThreadListChange={state.setExpandedThreadList}
          onSelectThread={onSelectThread}
          onDeleteThread={onDeleteThread}
          onRenameThread={onRenameThread}
        />
      )}
    </>
  );
}
