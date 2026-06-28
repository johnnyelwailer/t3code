import { useEffect, useState } from "react";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";

import { BackendProvider, createT3Backend } from "~/t3work/backend/t3work-index";
import { App as T3workApp } from "~/t3work/t3work-App";
import { T3workAddLocalWorkspaceProvider } from "~/t3work/components/t3work-addLocalWorkspaceContext";
import { useOpenAddProjectCommandPalette } from "~/commandPaletteContext";
import type { ProjectShellProject } from "@t3tools/project-context";
import { recordT3WorkThreadDebug } from "~/t3work/chat/t3work-threadDebug";
import {
  parseT3workRouteSearch,
  parseT3workViewFromPath,
  T3WORK_CREATE_PATH,
  type T3workRouteSearch,
} from "~/t3work/t3work-routeState";
import { readActiveThreadIdFromView } from "~/t3work/t3work-types";
import { Route as RootRoute } from "~/routes/__root";

import "~/t3work/t3work-index.css";

function resolveWsBaseUrl(): string {
  const wsUrl = import.meta.env.VITE_WS_URL?.trim();
  if (wsUrl) return wsUrl;

  const httpUrl = import.meta.env.VITE_HTTP_URL?.trim();
  if (httpUrl) {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  return "ws://localhost:3773";
}

function buildRouteSearch(
  search: T3workRouteSearch,
  input: {
    projectView?: T3workRouteSearch["projectView"];
    chatThreadId?: string | null;
  } = {},
): T3workRouteSearch {
  const { chatThreadId: _ignoredChatThreadId, setup: _ignoredSetup, ...rest } = search;
  const projectView = input.projectView ?? search.projectView;

  return {
    ...rest,
    ...(projectView ? { projectView } : {}),
    ...(input.chatThreadId ? { chatThreadId: input.chatThreadId } : {}),
  };
}

export function T3workRouteSurface() {
  const [backend] = useState(() => createT3Backend(resolveWsBaseUrl()));
  const { authGateState } = RootRoute.useRouteContext();
  const authenticated =
    authGateState.status === "authenticated" || authGateState.status === "hosted-static";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useSearch({
    strict: false,
    select: (search) => parseT3workRouteSearch(search as Record<string, unknown>),
  });
  const view = parseT3workViewFromPath(pathname, search);
  const isCreateRoute = pathname === T3WORK_CREATE_PATH;
  const viewType = view?.type ?? null;
  const viewProjectId = view?.projectId ?? null;
  const viewThreadId = readActiveThreadIdFromView(view);
  const viewTicketId = view?.type === "ticket" ? view.ticketId : null;
  const openAddProjectCommandPalette = useOpenAddProjectCommandPalette();

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
    recordT3WorkThreadDebug("route-surface.state", {
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
            This environment requires pairing before opening Nexi AI threads.
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
      <T3workAddLocalWorkspaceProvider openAddLocalWorkspace={openAddProjectCommandPalette}>
        <T3workApp
          view={view}
          dashboardMode={search.projectView ?? "my-work"}
          showCreate={isCreateRoute}
          reopenInitialSetup={search.setup === "welcome"}
          onCreateOpenChange={(open) => {
            void navigate({
              to: open ? "/t3work/new" : "/t3work",
              search: buildRouteSearch(search),
            });
          }}
          onOpenHome={() => {
            void navigate({ to: "/t3work", search: buildRouteSearch(search) });
          }}
          onOpenSettings={() => {
            void navigate({ to: "/settings" });
          }}
          onOpenDashboard={(projectId, dashboardMode, embeddedThreadId) => {
            void navigate({
              to: "/t3work/projects/$projectId",
              params: { projectId },
              search: buildRouteSearch(search, {
                projectView: dashboardMode,
                chatThreadId: embeddedThreadId ?? null,
              }),
            });
          }}
          onOpenTicket={(projectId, ticketId, embeddedThreadId) => {
            void navigate({
              to: "/t3work/projects/$projectId/tickets/$ticketId",
              params: { projectId, ticketId },
              search: buildRouteSearch(search, {
                chatThreadId: embeddedThreadId ?? null,
              }),
            });
          }}
          onOpenThread={(projectId, threadId) => {
            void navigate({
              to: "/t3work/projects/$projectId/threads/$threadId",
              params: { projectId, threadId },
              search: buildRouteSearch(search),
            });
          }}
          onProjectCreated={(project: ProjectShellProject) => {
            void navigate({
              to: "/t3work/projects/$projectId",
              params: { projectId: project.id },
              search: buildRouteSearch(search),
            });
          }}
        />
      </T3workAddLocalWorkspaceProvider>
    </BackendProvider>
  );
}
