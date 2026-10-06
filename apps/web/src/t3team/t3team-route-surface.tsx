import { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";

import { BackendProvider, createT3Backend } from "~/t3team/backend/t3team-index";
import { App as T3TeamApp } from "~/t3team/t3team-App";
import { T3TeamAddLocalWorkspaceProvider } from "~/t3team/components/t3team-addLocalWorkspaceContext";
import { openCommandPalette } from "~/commandPaletteBus";
import type { ProjectShellProject } from "@t3tools/project-context";
import { APP_DISPLAY_NAME } from "~/t3team/t3team-branding";
import { recordT3TeamThreadDebug } from "~/t3team/chat/t3team-threadDebug";
import {
  parseT3TeamRouteSearch,
  parseT3TeamViewFromPath,
  T3TEAM_CREATE_PATH,
} from "~/t3team/t3team-routeState";
import { readActiveThreadIdFromView } from "~/t3team/t3team-types";
import { Route as RootRoute } from "~/routes/__root";

import "~/t3team/t3team-index.css";
import { readProjectIdFromView } from "~/t3team/t3team-types";
import { resolveWsBaseUrl } from "~/t3team/t3team-route-surface-wsUrl";
import { isTeamShellEnvironment } from "~/t3team/t3team-upstreamRouteBridge";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { readThreadShells } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { buildThreadRouteParams } from "~/threadRoutes";
import { buildRouteSearch } from "~/t3team/t3team-buildRouteSearch";
import { useCreateProjectRequestNavigation } from "~/t3team/hooks/t3team-useCreateProjectRequestNavigation";

export function T3TeamRouteSurface() {
  const [backend] = useState(() => createT3Backend(resolveWsBaseUrl()));
  const { authGateState } = RootRoute.useRouteContext();
  const authenticated =
    authGateState.status === "authenticated" || authGateState.status === "hosted-static";
  const navigate = useNavigate();
  useCreateProjectRequestNavigation();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useSearch({
    strict: false,
    select: (search) => parseT3TeamRouteSearch(search as Record<string, unknown>),
  });
  const view = parseT3TeamViewFromPath(pathname, search);
  const isCreateRoute = pathname === T3TEAM_CREATE_PATH;
  const viewType = view?.type ?? null;
  const viewProjectId = readProjectIdFromView(view ?? null);
  const viewThreadId = readActiveThreadIdFromView(view);
  const viewTicketId = view?.type === "ticket" ? view.ticketId : null;
  // Upstream replaced the add-project context with a window event bus, so the palette no
  // longer has to be an ancestor provider of this surface.
  const openAddProjectCommandPalette = useCallback(
    () => openCommandPalette({ open: "add-project" }),
    [],
  );

  useEffect(() => {
    if (!authenticated) {
      return;
    }
    void backend.connect();
    return () => {
      void backend.disconnect();
    };
  }, [authenticated, backend]);

  useEffect(() => {
    recordT3TeamThreadDebug("route-surface.state", {
      pathname,
      authState: authGateState.status,
      isCreateRoute,
      viewType,
      viewProjectId,
      viewThreadId,
      viewTicketId,
    });
  }, [
    authGateState.status,
    isCreateRoute,
    pathname,
    viewProjectId,
    viewThreadId,
    viewTicketId,
    viewType,
  ]);

  if (!authenticated) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-xl rounded-lg border border-border/70 bg-card/30 p-8 shadow-sm/5">
          <h2 className="text-xl font-semibold">Authentication required</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This environment requires pairing before opening {APP_DISPLAY_NAME} threads.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={() => {
                window.location.href = "/pair";
              }}
            >
              Open pairing page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BackendProvider backend={backend}>
      <T3TeamAddLocalWorkspaceProvider openAddLocalWorkspace={openAddProjectCommandPalette}>
        <T3TeamApp
          view={view}
          dashboardMode={search.projectView ?? "my-work"}
          showCreate={isCreateRoute}
          reopenInitialSetup={search.setup === "welcome"}
          onCreateOpenChange={(open) => {
            void navigate({
              to: open ? "/t3team/new" : "/t3team",
              search: buildRouteSearch(search),
            });
          }}
          onOpenHome={() => {
            void navigate({ to: "/t3team", search: buildRouteSearch(search) });
          }}
          onOpenSettings={() => {
            void navigate({ to: "/settings" });
          }}
          onOpenDashboard={(projectId, dashboardMode, embeddedThreadId) => {
            void navigate({
              to: "/t3team/projects/$projectId",
              params: { projectId },
              search: buildRouteSearch(search, {
                projectView: dashboardMode,
                chatThreadId: embeddedThreadId ?? null,
              }),
            });
          }}
          onOpenTicket={(projectId, ticketId, embeddedThreadId) => {
            void navigate({
              to: "/t3team/projects/$projectId/tickets/$ticketId",
              params: { projectId, ticketId },
              search: buildRouteSearch(search, {
                chatThreadId: embeddedThreadId ?? null,
              }),
            });
          }}
          onOpenThread={(projectId, threadId) => {
            // The Team thread view talks to the primary server only; elsewhere, upstream's view.
            const shell = readThreadShells().find((candidate) => candidate.id === threadId);
            if (shell && !isTeamShellEnvironment(shell.environmentId, primaryEnvironmentId)) {
              void navigate({
                to: "/$environmentId/$threadId",
                params: buildThreadRouteParams(scopeThreadRef(shell.environmentId, shell.id)),
              });
              return;
            }
            void navigate({
              to: "/t3team/projects/$projectId/threads/$threadId",
              params: { projectId, threadId },
              search: buildRouteSearch(search),
            });
          }}
          onCloseEmbeddedThread={() => {
            void navigate({
              to: pathname,
              // Keep the current parent route and all of its search state; only close the pane.
              search: (current) => {
                const { chatThreadId: _ignoredChatThreadId, ...rest } = current;
                return rest;
              },
              replace: true,
              resetScroll: false,
            });
          }}
          onProjectCreated={(project: ProjectShellProject) => {
            // Replace, not push: Back must not return to a form for a project that now exists.
            void navigate({
              to: project.source.provider === "local" ? "/t3team" : "/t3team/projects/$projectId",
              ...(project.source.provider === "local" ? {} : { params: { projectId: project.id } }),
              search: buildRouteSearch(search),
              replace: true,
            });
          }}
        />
      </T3TeamAddLocalWorkspaceProvider>
    </BackendProvider>
  );
}
