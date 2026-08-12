import { ProjectSidebarCurrentIssuesContent } from "./t3team-ProjectSidebarCurrentIssuesContent";
import { ProjectSidebarDashboardNav } from "./t3team-ProjectSidebarDashboardNav";
import { ProjectSidebarDashboardThreadList } from "./t3team-ProjectSidebarDashboardThreadList";
import { ProjectSidebarProjectHeader } from "./t3team-ProjectSidebarProjectHeader";
import { ProjectSidebarProjectThreadSection } from "./t3team-ProjectSidebarProjectThreadSection";
import { ProjectSidebarPinnedItems } from "./t3team-ProjectSidebarPinnedItems";
import { deriveProjectSidebarPinnedFeedState } from "./t3team-projectSidebarPinnedFeedState";
import type { ProjectRowProps } from "./t3team-projectSidebarProjectRowTypes";
import { useProjectSidebarProjectRow } from "./t3team-useProjectSidebarProjectRow";
import { useProjectSidebarProjectRowPinnedState } from "./t3team-useProjectSidebarProjectRowPinnedState";
import {
  getSidebarProjectSectionState,
  getSidebarProjectState,
} from "./t3team-projectSidebarItemState";

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
          myWorkAutoExpandSignal={pinnedItems.length}
          onMyWorkExpandedChange={state.setMyWorkExpanded}
          onSelectBacklog={() => onSelectProjectDashboardMode(project.id, "backlog")}
          onSelectMyWork={() => {
            state.setMyWorkExpanded(true);
            onSelectProjectDashboardMode(project.id, "my-work");
          }}
          backlogContent={
            <ProjectSidebarDashboardThreadList
              projectId={project.id}
              workspaceRoot={project.workspace?.rootPath ?? null}
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
                workspaceRoot={project.workspace?.rootPath ?? null}
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
          {...(state.githubActivityLastCheckedAt !== undefined
            ? { githubActivityLastCheckedAt: state.githubActivityLastCheckedAt }
            : {})}
        />
      ) : null}

      {expanded && showProjectThreads && (
        <ProjectSidebarProjectThreadSection
          projectId={project.id}
          workspaceRoot={project.workspace?.rootPath ?? null}
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
