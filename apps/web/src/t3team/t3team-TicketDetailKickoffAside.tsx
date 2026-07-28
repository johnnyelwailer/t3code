import { useMemo } from "react";
import { useBackend } from "~/t3team/backend/t3team-index";
import { readProjectSetupProfileIdFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { useAtlassianCurrentUserDisplayName } from "~/t3team/hooks/t3team-useAtlassianCurrentUserDisplayName";
import { TicketKickoffComposer } from "~/t3team/t3team-TicketKickoffComposer";
import { TicketKickoffPanel } from "~/t3team/t3team-TicketKickoffPanel";
import { EmbeddedThreadAside } from "~/t3team/t3team-EmbeddedThreadAside";
import { buildTicketLinkedResources } from "~/t3team/t3team-ticketDetailKickoffLinkedResources";
import type { TicketDetailKickoffAsideProps } from "~/t3team/t3team-TicketDetailKickoffAside.types";
import { buildTicketRecipeContext } from "~/t3team/t3team-ticketDetailKickoffRecipeContext";
import { useTicketKickoffInjectedContextAttachments } from "~/t3team/t3team-useTicketKickoffInjectedContextAttachments";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";

export type { TicketDetailKickoffAsideProps } from "~/t3team/t3team-TicketDetailKickoffAside.types";

export function TicketDetailKickoffAside({
  project,
  displayId,
  ticketTitle,
  ticket,
  ticketStatus,
  ticketRelationshipKeys,
  relatedTickets,
  jiraIssueType,
  ticketPriority,
  issueThreads,
  projectId,
  projectTitle,
  projectWorkspaceRoot,
  ticketId,
  activeThread,
  githubActivityItems,
  providers,
  isConnected,
  onOpenThread,
  onOpenFullThread,
  onThreadKickoffConsumed,
  onKickoffThread,
}: TicketDetailKickoffAsideProps) {
  const backend = useBackend();
  const profileId = readProjectSetupProfileIdFromProject(project);
  const injectedContextAttachments = useTicketKickoffInjectedContextAttachments({
    projectId,
    ticketId,
  });
  const currentUserDisplayName = useAtlassianCurrentUserDisplayName(project.source.accountId);
  const ticketRecipeContext = useMemo(
    () =>
      buildTicketRecipeContext({
        ticket,
        ticketStatus,
        ticketRelationshipKeys,
        githubActivityItems,
        ...(project.source.accountId ? { currentUserAccountId: project.source.accountId } : {}),
        ...(currentUserDisplayName ? { currentUserDisplayName } : {}),
      }),
    [
      currentUserDisplayName,
      githubActivityItems,
      project.source.accountId,
      ticket,
      ticketRelationshipKeys,
      ticketStatus,
    ],
  );
  const recipeLinkedResources = useMemo(
    () =>
      buildTicketLinkedResources({
        relatedTickets,
        ticketRelationshipKeys,
        githubActivityItems,
      }),
    [githubActivityItems, relatedTickets, ticketRelationshipKeys],
  );
  const quickStartRecipeInput = useMemo(
    () => ({
      backend,
      surface: "workitem.detail.sidepanel" as const,
      project,
      profileId,
      selectedWorkLabel: displayId,
      selectedWorkTitle: ticketTitle,
      resourceKind: "ticket" as const,
      jiraIssueType,
      workitemPriority: ticketPriority,
      ticketContext: ticketRecipeContext,
      linkedResources: recipeLinkedResources,
      availableIntegrations: githubActivityItems.length > 0 ? (["github"] as const) : [],
      availableContextKeys: ["project.summary", "ticket.summary"] as const,
    }),
    [
      backend,
      displayId,
      githubActivityItems.length,
      jiraIssueType,
      project,
      recipeLinkedResources,
      ticketPriority,
      ticketRecipeContext,
      ticketTitle,
    ],
  );

  if (activeThread) {
    return (
      <EmbeddedThreadAside
        thread={activeThread}
        projectId={projectId}
        projectTitle={projectTitle}
        projectSource={project.source}
        {...(projectWorkspaceRoot ? { projectWorkspaceRoot } : {})}
        ticketId={ticketId}
        {...(onOpenFullThread
          ? { onOpenFullThread: () => onOpenFullThread(projectId, activeThread.id) }
          : {})}
        onThreadKickoffConsumed={onThreadKickoffConsumed}
      />
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border/70 bg-background [view-transition-name:t3team-right-sidebar-panel]">
      <TicketKickoffPanel
        profileId={profileId}
        issueThreads={issueThreads}
        projectId={projectId}
        quickStartRecipeInput={quickStartRecipeInput}
        injectedContextAttachments={injectedContextAttachments}
        onOpenThread={(threadId) =>
          runT3TeamViewTransition(() => onOpenThread(projectId, threadId))
        }
        onKickoff={(
          instruction,
          kickoffPending,
          kickoffModelSelection,
          kickoffRuntimeMode,
          kickoffInteractionMode,
          selectedToolIds,
          kickoffContextAttachments,
          kickoffWorkflow,
        ) => {
          runT3TeamViewTransition(() => {
            onKickoffThread({
              projectId,
              ticketId,
              ticketDisplayId: displayId,
              githubActivityItems,
              kickoffMessage: instruction,
              ...(kickoffPending !== undefined ? { kickoffPending } : {}),
              kickoffModelSelection,
              kickoffRuntimeMode,
              kickoffInteractionMode,
              selectedToolIds,
              kickoffContextAttachments,
              ...(kickoffWorkflow ? { kickoffWorkflow } : {}),
            });
          });
        }}
        renderComposer={({
          composerRef,
          prefillText,
          selectedRecipe,
          onClearSelectedRecipe,
          onSubmit,
        }) => (
          <TicketKickoffComposer
            ref={composerRef}
            {...(prefillText ? { prefillText } : {})}
            {...(selectedRecipe ? { selectedRecipe } : {})}
            {...(onClearSelectedRecipe ? { onClearSelectedRecipe } : {})}
            providers={providers}
            isConnected={isConnected}
            {...(project.workspace?.rootPath ? { workspaceRoot: project.workspace.rootPath } : {})}
            onSubmit={onSubmit}
          />
        )}
      />
    </aside>
  );
}
