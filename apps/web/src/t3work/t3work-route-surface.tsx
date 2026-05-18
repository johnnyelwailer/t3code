import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { BackendProvider, createT3Backend } from "~/t3work/backend/t3work-index";
import { App as T3workApp } from "~/t3work/t3work-App";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ViewState } from "~/t3work/t3work-types";

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

const T3WORK_BASE_PATH = "/t3work";
const T3WORK_CREATE_PATH = "/t3work/new";
const T3WORK_PATH_SEGMENT = "projects";
const T3WORK_TICKET_SEGMENT = "tickets";
const T3WORK_THREAD_SEGMENT = "threads";

type AuthState = "checking" | "authenticated" | "unauthenticated";

function parseT3workViewFromPath(pathname: string): ViewState | null {
  if (pathname === T3WORK_BASE_PATH || pathname === T3WORK_CREATE_PATH) {
    return null;
  }

  const suffix = pathname.startsWith(`${T3WORK_BASE_PATH}/`)
    ? pathname.slice(T3WORK_BASE_PATH.length + 1)
    : "";

  if (!suffix) {
    return null;
  }

  const segments = suffix.split("/").map((part) => decodeURIComponent(part));
  if (segments.length < 2 || segments[0] !== T3WORK_PATH_SEGMENT || !segments[1]) {
    return null;
  }

  const projectId = segments[1];

  if (segments.length === 2) {
    return { type: "dashboard", projectId };
  }

  if (segments.length === 4 && segments[2] === T3WORK_TICKET_SEGMENT && segments[3]) {
    return { type: "ticket", projectId, ticketId: segments[3] };
  }

  if (segments.length === 4 && segments[2] === T3WORK_THREAD_SEGMENT && segments[3]) {
    return { type: "thread", projectId, threadId: segments[3] };
  }

  return null;
}

export function T3workRouteSurface() {
  const [backend] = useState(() => createT3Backend(resolveWsBaseUrl()));
  const [authState, setAuthState] = useState<AuthState>("checking");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const view = parseT3workViewFromPath(pathname);
  const isCreateRoute = pathname === T3WORK_CREATE_PATH;

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { credentials: "include" });
        const session = (await response.json().catch(() => null)) as {
          authenticated?: boolean;
        } | null;
        if (cancelled) return;
        setAuthState(session?.authenticated ? "authenticated" : "unauthenticated");
      } catch {
        if (cancelled) return;
        setAuthState("unauthenticated");
      }
    };

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }
    void backend.connect();
    return () => {
      void backend.disconnect();
    };
  }, [authState, backend]);

  if (authState === "checking") {
    return <div className="flex min-h-0 flex-1 items-center justify-center bg-background" />;
  }

  if (authState === "unauthenticated") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-xl rounded-lg border border-border/70 bg-card/30 p-8 shadow-sm/5">
          <h2 className="text-xl font-semibold">Authentication required</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This environment requires pairing before opening T3 Work threads.
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
      <T3workApp
        view={view}
        showCreate={isCreateRoute}
        onCreateOpenChange={(open) => {
          void navigate({ to: open ? "/t3work/new" : "/t3work" });
        }}
        onOpenHome={() => {
          void navigate({ to: "/t3work" });
        }}
        onOpenSettings={() => {
          void navigate({ to: "/settings" });
        }}
        onOpenDashboard={(projectId) => {
          void navigate({ to: "/t3work/projects/$projectId", params: { projectId } });
        }}
        onOpenTicket={(projectId, ticketId) => {
          void navigate({
            to: "/t3work/projects/$projectId/tickets/$ticketId",
            params: { projectId, ticketId },
          });
        }}
        onOpenThread={(projectId, threadId) => {
          void navigate({
            to: "/t3work/projects/$projectId/threads/$threadId",
            params: { projectId, threadId },
          });
        }}
        onProjectCreated={(project: ProjectShellProject) => {
          void navigate({
            to: "/t3work/projects/$projectId",
            params: { projectId: project.id },
          });
        }}
      />
    </BackendProvider>
  );
}
