import { useMemo, useRef, useState } from "react";
import { useBackend } from "~/t3work/backend/t3work-index";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import { useProjectDashboardInjectedContextAttachments } from "~/t3work/hooks/t3work-useProjectDashboardInjectedContextAttachments";
import type { ProjectDashboardKickoffAsideProps } from "~/t3work/t3work-ProjectDashboardKickoffAsideTypes";
import { EmbeddedThreadAside } from "~/t3work/t3work-EmbeddedThreadAside";
import { readProjectSetupProfileIdFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { T3workKickoffRecipeList } from "~/t3work/t3work-KickoffRecipeList";
import { ProjectDashboardKickoffComposer } from "~/t3work/t3work-ProjectDashboardKickoffComposer";
import { ProjectDashboardRecentConversations } from "~/t3work/t3work-ProjectDashboardRecentConversations";
import { useRunT3workDashboardRecipeAction } from "~/t3work/t3work-dashboardRecipeActions";
import { buildProjectDashboardSelectedRecipe } from "~/t3work/t3work-dashboardRecipeSelection";
import {
  areT3workRecipeQuickStartLaunchCustomizationsEqual,
  buildT3workSelectedRecipeKickoffLaunch,
  type T3workSelectedRecipeQuickStart,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import { useT3workDashboardRecipeViewSummary } from "~/t3work/t3work-dashboardRecipeViewContext";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";
import { useT3workSidecarRecipeQuickStarts } from "~/t3work/t3work-sidecarRecipes";
import { type T3workKickoffComposerHandle } from "~/t3work/t3work-TicketKickoffComposer";

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
  const runDashboardRecipeAction = useRunT3workDashboardRecipeAction();
  const composerRef = useRef<T3workKickoffComposerHandle | null>(null);
  const { clearInjectedContextAttachments, injectedContextAttachments, removeContextAttachment } =
    useProjectDashboardInjectedContextAttachments(project.id);
  const [selectedRecipe, setSelectedRecipe] = useState<T3workSelectedRecipeQuickStart | null>(null);
  const currentViewSummary = useT3workDashboardRecipeViewSummary();

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
      profileId: readProjectSetupProfileIdFromProject(project),
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
  const quickStartRecipes = useT3workSidecarRecipeQuickStarts(quickStartRecipeInput);

  if (activeThread) {
    return (
      <EmbeddedThreadAside
        thread={activeThread}
        projectId={project.id}
        projectTitle={project.title}
        {...(project.workspace?.rootPath
          ? { projectWorkspaceRoot: project.workspace.rootPath }
          : {})}
        {...(onOpenFullThread ? { onOpenFullThread: () => onOpenFullThread(activeThread.id) } : {})}
        onThreadKickoffConsumed={onThreadKickoffConsumed}
      />
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border/70 bg-background [view-transition-name:t3work-right-sidebar-panel]">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h3 className="text-base font-semibold">Kick off a project thread</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Start a focused conversation for {project.title} and continue it in full thread view.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4 sm:p-5">
          <section className="space-y-3">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Quick starts
            </h4>
            <T3workKickoffRecipeList
              recipes={quickStartRecipes}
              {...(selectedRecipe?.recipe.id ? { selectedRecipeId: selectedRecipe.recipe.id } : {})}
              onSelectRecipe={(recipe, customization) => {
                const nextSelectedRecipe = buildProjectDashboardSelectedRecipe({
                  recipe,
                  ...(customization ? { customization } : {}),
                  runDashboardRecipeAction,
                });
                if (nextSelectedRecipe) {
                  setSelectedRecipe((current) => {
                    if (
                      current?.recipe.id === nextSelectedRecipe.recipe.id &&
                      areT3workRecipeQuickStartLaunchCustomizationsEqual(
                        current.customization,
                        nextSelectedRecipe.customization,
                      )
                    ) {
                      return current;
                    }

                    return nextSelectedRecipe;
                  });
                }
              }}
            />
          </section>

          <ProjectDashboardRecentConversations
            threads={projectThreads}
            onOpenThread={onOpenThread}
          />
        </div>
      </ScrollArea>

      <ProjectDashboardKickoffComposer
        ref={composerRef}
        {...(selectedRecipe ? { selectedRecipe } : {})}
        onClearSelectedRecipe={() => setSelectedRecipe(null)}
        providers={providers}
        isConnected={isConnected}
        injectedContextAttachments={injectedContextAttachments}
        onRemoveContextAttachment={removeContextAttachment}
        onSubmit={(text, selection, runtimeMode, interactionMode, selectedToolIds) => {
          runT3workViewTransition(() => {
            const kickoff = selectedRecipe
              ? buildT3workSelectedRecipeKickoffLaunch({
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
            clearInjectedContextAttachments();
            setSelectedRecipe(null);
          });
        }}
      />
    </aside>
  );
}
