import { useMemo } from "react";
import { useBackend } from "~/t3work/backend/t3work-index";
import { readProjectSetupProfileIdFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { useAtlassianCurrentUserDisplayName } from "~/t3work/hooks/t3work-useAtlassianCurrentUserDisplayName";
import { TicketKickoffComposer } from "~/t3work/t3work-TicketKickoffComposer";
import { TicketKickoffPanel } from "~/t3work/t3work-TicketKickoffPanel";
import { EmbeddedThreadAside } from "~/t3work/t3work-EmbeddedThreadAside";
import { buildTicketLinkedResources } from "~/t3work/t3work-ticketDetailKickoffLinkedResources";
import type { TicketDetailKickoffAsideProps } from "~/t3work/t3work-TicketDetailKickoffAside.types";
import { buildTicketRecipeContext } from "~/t3work/t3work-ticketDetailKickoffRecipeContext";
import { useTicketKickoffInjectedContextAttachments } from "~/t3work/t3work-useTicketKickoffInjectedContextAttachments";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";
import { useT3workSidecarRecipeQuickStarts } from "~/t3work/t3work-sidecarRecipes";

export type { TicketDetailKickoffAsideProps } from "~/t3work/t3work-TicketDetailKickoffAside.types";

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
      profileId: readProjectSetupProfileIdFromProject(project),
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
  const quickStartRecipes = useT3workSidecarRecipeQuickStarts(quickStartRecipeInput);

  if (activeThread) {
    return (
      <EmbeddedThreadAside
        thread={activeThread}
        projectId={projectId}
        projectTitle={projectTitle}
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
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border/70 bg-background [view-transition-name:t3work-right-sidebar-panel]">
      <TicketKickoffPanel
        displayId={displayId}
        issueThreads={issueThreads}
        quickStartRecipes={quickStartRecipes}
        injectedContextAttachments={injectedContextAttachments}
        onOpenThread={(threadId) =>
          runT3workViewTransition(() => onOpenThread(projectId, threadId))
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
          runT3workViewTransition(() => {
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
            onSubmit={onSubmit}
          />
        )}
      />
    </aside>
  );
}
