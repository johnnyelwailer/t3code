import { useMemo } from "react";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useBackend } from "~/t3team/backend/t3team-index";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import { useProjectDashboardInjectedContextAttachments } from "~/t3team/hooks/t3team-useProjectDashboardInjectedContextAttachments";
import type { ProjectDashboardKickoffAsideProps } from "~/t3team/t3team-ProjectDashboardKickoffAsideTypes";
import { EmbeddedThreadAside } from "~/t3team/t3team-EmbeddedThreadAside";
import { readProjectSetupProfileIdFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { ProjectDashboardKickoffComposer } from "~/t3team/t3team-ProjectDashboardKickoffComposer";
import { T3TeamSidecarComposition } from "~/t3team/t3team-SidecarComposition";
import { useRunT3TeamDashboardRecipeAction } from "~/t3team/t3team-dashboardRecipeActions";
import { buildProjectDashboardSelectedRecipe } from "~/t3team/t3team-dashboardRecipeSelection";
import { buildT3TeamSelectedRecipeKickoffLaunch } from "~/t3team/t3team-recipeQuickStartLaunch";
import { useT3TeamDashboardRecipeViewSummary } from "~/t3team/t3team-dashboardRecipeViewContext";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";
import { useT3TeamSidecarRecipeQuickStarts } from "~/t3team/t3team-sidecarRecipes";
import { useBundledSidecarRecipeLaunch } from "~/t3team/t3team-useBundledSidecarRecipeLaunch";

export function ProjectDashboardKickoffAside({
  project,
  dashboardMode,
  projectThreads,
  activeThread,
  providers,
  isConnected,
  onOpenThread,
  onOpenFullThread,
  onThreadKickoffConsumed,
  onKickoffThread,
}: ProjectDashboardKickoffAsideProps) {
  const backend = useBackend();
  const environmentId = usePrimaryEnvironmentId();
  const runDashboardRecipeAction = useRunT3TeamDashboardRecipeAction();
  const profileId = readProjectSetupProfileIdFromProject(project);
  const { clearInjectedContextAttachments, injectedContextAttachments, removeContextAttachment } =
    useProjectDashboardInjectedContextAttachments(project.id);
  const currentViewSummary = useT3TeamDashboardRecipeViewSummary();
  const sidecarSurface =
    dashboardMode === "my-work" ? "project.dashboard.myWork" : "project.dashboard.backlog";

  const primaryWorkitemAttachment = useMemo(
    () => injectedContextAttachments.find((attachment) => attachment.kind === "jira-work-item"),
    [injectedContextAttachments],
  );
  const quickStartContextKeys = useMemo(() => {
    const keys = [
      "project.summary",
      dashboardMode === "my-work" ? "dashboard.my-work.summary" : "dashboard.backlog.summary",
    ];
    if (injectedContextAttachments.length > 0) {
      keys.push("attached-context.summary");
    }
    if (primaryWorkitemAttachment) {
      keys.push("selected-work.summary", "ticket.summary");
    }
    return keys;
  }, [dashboardMode, injectedContextAttachments.length, primaryWorkitemAttachment]);
  const quickStartRecipeInput = useMemo(
    () => ({
      backend,
      surface: "project.dashboard" as const,
      project,
      profileId,
      selectedWorkLabel: primaryWorkitemAttachment?.label ?? project.title,
      dashboardMode,
      currentViewSummary: currentViewSummary ?? undefined,
      ...(primaryWorkitemAttachment ? { resourceKind: "ticket" as const } : {}),
      ...(primaryWorkitemAttachment?.jiraIssueType
        ? { jiraIssueType: primaryWorkitemAttachment.jiraIssueType }
        : {}),
      contextAttachments: injectedContextAttachments,
      availableContextKeys: quickStartContextKeys,
    }),
    [
      backend,
      currentViewSummary,
      dashboardMode,
      injectedContextAttachments,
      primaryWorkitemAttachment,
      project,
      quickStartContextKeys,
    ],
  );
  const slashRecipes = useT3TeamSidecarRecipeQuickStarts(quickStartRecipeInput);
  const { clearSelectedRecipe, composerRef, selectedRecipe, sidecarHost, stageRecipeKickoff } =
    useBundledSidecarRecipeLaunch({
      backend,
      environmentId,
      projectId: project.id,
      surface: sidecarSurface,
      projectWorkspaceRoot: project.workspace?.rootPath,
      openThread: onOpenThread,
      buildSelectedRecipe: (recipe, customization) =>
        buildProjectDashboardSelectedRecipe({
          recipe,
          ...(customization ? { customization } : {}),
          runDashboardRecipeAction,
        }),
      createThread: ({ kickoffMessage, kickoffWorkflow, launchConfig }) =>
        onKickoffThread(
          kickoffMessage,
          false,
          launchConfig.selection,
          launchConfig.runtimeMode,
          launchConfig.interactionMode,
          launchConfig.selectedToolIds,
          injectedContextAttachments,
          kickoffWorkflow,
        ) as string | undefined,
      onLaunched: clearInjectedContextAttachments,
    });

  const resetKickoffState = () => {
    clearInjectedContextAttachments();
    clearSelectedRecipe();
  };

  if (activeThread) {
    return (
      <EmbeddedThreadAside
        thread={activeThread}
        projectId={project.id}
        projectTitle={project.title}
        projectSource={project.source}
        {...(project.workspace?.rootPath
          ? { projectWorkspaceRoot: project.workspace.rootPath }
          : {})}
        {...(onOpenFullThread ? { onOpenFullThread: () => onOpenFullThread(activeThread.id) } : {})}
        onThreadKickoffConsumed={onThreadKickoffConsumed}
      />
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border/70 bg-background [view-transition-name:t3team-right-sidebar-panel]">
      <ScrollArea className="min-h-0 flex-1">
        <T3TeamSidecarComposition
          surface={sidecarSurface}
          profileId={profileId}
          host={sidecarHost}
          resolveSectionProps={(sectionId) => {
            if (sectionId === "quick-starts") {
              return {
                recipeInput: quickStartRecipeInput,
                // Reuse the catalog already resolved for the composer slash menu:
                // one `discoverRecipes` round-trip per dashboard mount, not two.
                quickStarts: slashRecipes,
                ...(selectedRecipe?.recipe.id
                  ? { selectedRecipeId: selectedRecipe.recipe.id }
                  : {}),
              };
            }

            if (sectionId === "recent-conversations") {
              return { threads: projectThreads };
            }

            return undefined;
          }}
        />
      </ScrollArea>

      <ProjectDashboardKickoffComposer
        ref={composerRef}
        {...(selectedRecipe ? { selectedRecipe } : {})}
        onClearSelectedRecipe={clearSelectedRecipe}
        providers={providers}
        isConnected={isConnected}
        {...(project.workspace?.rootPath ? { workspaceRoot: project.workspace.rootPath } : {})}
        slashRecipes={slashRecipes}
        onSelectSlashRecipe={stageRecipeKickoff}
        injectedContextAttachments={injectedContextAttachments}
        onRemoveContextAttachment={removeContextAttachment}
        onSubmit={(text, selection, runtimeMode, interactionMode, selectedToolIds) => {
          runT3TeamViewTransition(() => {
            const kickoff = selectedRecipe
              ? buildT3TeamSelectedRecipeKickoffLaunch({
                  selectedRecipe,
                  customMessage: text,
                })
              : {
                  kickoffMessage: text,
                  kickoffPending: true,
                };
            onKickoffThread(
              kickoff.kickoffMessage,
              kickoff.kickoffPending,
              selection,
              runtimeMode,
              interactionMode,
              selectedToolIds,
              injectedContextAttachments,
              selectedRecipe?.recipe.workflow,
            );
            resetKickoffState();
          });
        }}
      />
    </aside>
  );
}
