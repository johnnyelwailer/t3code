/**
 * "New chat here" where each view already offers its agent actions: the real project dashboard
 * header (My Work) and the real ticket page header. The app shell's start is replaced by a line
 * that names the view the new thread would open beside.
 */
import { useState } from "react";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import { T3TeamDashboardRecipeActionProvider } from "~/t3team/t3team-dashboardRecipeActions";
import { T3TeamDashboardRecipeViewProvider } from "~/t3team/t3team-dashboardRecipeViewContext";
import { NewChatHereButton } from "~/t3team/t3team-NewChatHereButton";
import { ProjectDashboard } from "~/t3team/t3team-ProjectDashboard";
import { StartChatHereProvider } from "~/t3team/t3team-startChatHereContext";
import { viewTargetTitle, type T3TeamViewTarget } from "~/t3team/t3team-viewTarget";
import { WorkItemDetailHeader } from "~/t3team/workitem/t3team-WorkItemDetailHeader";

import { createViewTabsBackend, storyProject, TICKET_4711 } from "./t3team-viewTabsStoryFixtures";

const ignore = () => undefined;

export function NewChatHereScenario() {
  const [scenario] = useState(() => {
    const project = storyProject("newchat");
    return { project, backend: createViewTabsBackend(project, "ready") };
  });
  const [started, setStarted] = useState<T3TeamViewTarget | null>(null);
  const { project, backend } = scenario;
  return (
    <BackendProvider backend={backend}>
      <StartChatHereProvider value={setStarted}>
        <div className="flex min-h-screen flex-col gap-6 bg-background p-4 text-foreground">
          <p className="text-xs text-muted-foreground" data-testid="new-chat-here-started">
            {started === null
              ? "Click New chat here."
              : `New thread opens with "${viewTargetTitle(started)}" as a tab beside it.`}
          </p>
          <section className="flex h-[520px] flex-col overflow-hidden rounded-lg border border-border">
            <T3TeamDashboardRecipeViewProvider>
              <T3TeamDashboardRecipeActionProvider>
                <ProjectDashboard
                  project={project}
                  tickets={[]}
                  onOpenTicket={ignore}
                  onManageRepositories={ignore}
                  onProjectUpdated={ignore}
                />
              </T3TeamDashboardRecipeActionProvider>
            </T3TeamDashboardRecipeViewProvider>
          </section>
          <section className="overflow-hidden rounded-lg border border-border">
            <WorkItemDetailHeader
              breadcrumb={{ projectTitle: project.title, itemKey: TICKET_4711.displayId }}
              externalUrl={`https://example.atlassian.net/browse/${TICKET_4711.displayId}`}
              isRefreshing={false}
              onBack={ignore}
              onRefresh={ignore}
              actions={
                <NewChatHereButton
                  target={{
                    kind: "work-item",
                    projectId: project.id,
                    ticketId: TICKET_4711.id,
                    displayId: TICKET_4711.displayId,
                    title: TICKET_4711.title,
                  }}
                />
              }
            />
          </section>
        </div>
      </StartChatHereProvider>
    </BackendProvider>
  );
}
