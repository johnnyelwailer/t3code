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
  type T3TeamRouteSearch,
} from "~/t3team/t3team-routeState";
import { readActiveThreadIdFromView } from "~/t3team/t3team-types";
import { Route as RootRoute } from "~/routes/__root";

import "~/t3team/t3team-index.css";
import { readProjectIdFromView } from "~/t3team/t3team-types";

function resolveWsBaseUrl(): string {
  const wsUrl = import.meta.env.VITE_WS_URL?.trim();
  if (wsUrl) return wsUrl;

  const httpUrl = import.meta.env.VITE_HTTP_URL?.trim();
  if (httpUrl) {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  // Dev and self-hosted web are single-origin: Vite (dev) and the server (prod)
  // both route /api and /ws from the page origin. A hardcoded port here pointed
  // t3team backend calls at dead localhost:3773 whenever the server ran on a
  // derived port, which surfaced as a permanent "You appear to be offline".
  if (typeof window !== "undefined" && window.location.host) {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${window.location.host}`;
  }

  return "ws://localhost:3773";
}

function buildRouteSearch(
  search: T3TeamRouteSearch,
  input: {
    projectView?: T3TeamRouteSearch["projectView"];
    chatThreadId?: string | null;
  } = {},
): T3TeamRouteSearch {
  const { chatThreadId: _ignoredChatThreadId, setup: _ignoredSetup, ...rest } = search;
  const projectView = input.projectView ?? search.projectView;

  return {
    ...rest,
    ...(projectView ? { projectView } : {}),
    ...(input.chatThreadId ? { chatThreadId: input.chatThreadId } : {}),
  };
}

export function T3TeamRouteSurface() {
  const [backend] = useState(() => createT3Backend(resolveWsBaseUrl()));
  const { authGateState } = RootRoute.useRouteContext();
  const authenticated =
    authGateState.status === "authenticated" || authGateState.status === "hosted-static";
  const navigate = useNavigate();
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
            void navigate({
              to: project.source.provider === "local" ? "/t3team" : "/t3team/projects/$projectId",
              ...(project.source.provider === "local" ? {} : { params: { projectId: project.id } }),
              search: buildRouteSearch(search),
            });
          }}
        />
      </T3TeamAddLocalWorkspaceProvider>
    </BackendProvider>
  );
}
