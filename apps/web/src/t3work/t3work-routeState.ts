import type { ProjectDashboardBacklogRouteSearch } from "~/t3work/t3work-projectDashboardBacklogState";
import { parseProjectDashboardBacklogRouteSearch } from "~/t3work/t3work-projectDashboardBacklogState";
import type { ProjectDashboardModeRouteSearch } from "~/t3work/t3work-projectDashboardModeState";
import { parseProjectDashboardModeRouteSearch } from "~/t3work/t3work-projectDashboardModeState";
import type { ProjectDashboardMyWorkRouteSearch } from "~/t3work/t3work-projectDashboardMyWorkState";
import { parseProjectDashboardMyWorkRouteSearch } from "~/t3work/t3work-projectDashboardMyWorkState";
import type { ProjectSidebarRouteSearch } from "~/t3work/t3work-projectSidebarState";
import { parseProjectSidebarRouteSearch } from "~/t3work/t3work-projectSidebarState";
import type { ViewState } from "~/t3work/t3work-types";

export const T3WORK_BASE_PATH = "/t3work";
export const T3WORK_CREATE_PATH = "/t3work/new";
const T3WORK_PATH_SEGMENT = "projects";
const T3WORK_TICKET_SEGMENT = "tickets";
const T3WORK_THREAD_SEGMENT = "threads";
const T3WORK_RECIPES_SEGMENT = "recipes";
const T3WORK_CHAT_THREAD_SEARCH_KEY = "chatThreadId";
const T3WORK_SETUP_SEARCH_KEY = "setup";
const T3WORK_SETUP_WELCOME_VALUE = "welcome";

export type T3workRouteSearch = ProjectDashboardBacklogRouteSearch &
  ProjectDashboardMyWorkRouteSearch &
  ProjectDashboardModeRouteSearch &
  ProjectSidebarRouteSearch & {
    chatThreadId?: string;
    setup?: "welcome";
  };

export type T3workRouteSearchTarget =
  | { to: "/t3work" }
  | { to: "/t3work/new" }
  | { to: "/t3work/projects/$projectId"; params: { projectId: string } }
  | {
      to: "/t3work/projects/$projectId/tickets/$ticketId";
      params: { projectId: string; ticketId: string };
    }
  | {
      to: "/t3work/projects/$projectId/recipes";
      params: { projectId: string };
    }
  | {
      to: "/t3work/projects/$projectId/threads/$threadId";
      params: { projectId: string; threadId: string };
    };

export function parseT3workRouteSearch(search: Record<string, unknown>): T3workRouteSearch {
  const rawChatThreadId = search[T3WORK_CHAT_THREAD_SEARCH_KEY];
  const rawSetup = search[T3WORK_SETUP_SEARCH_KEY];
  const chatThreadId =
    typeof rawChatThreadId === "string" && rawChatThreadId.length > 0 ? rawChatThreadId : null;
  const setup = rawSetup === T3WORK_SETUP_WELCOME_VALUE ? T3WORK_SETUP_WELCOME_VALUE : null;

  return {
    ...parseProjectDashboardBacklogRouteSearch(search),
    ...parseProjectDashboardMyWorkRouteSearch(search),
    ...parseProjectDashboardModeRouteSearch(search),
    ...parseProjectSidebarRouteSearch(search),
    ...(chatThreadId ? { chatThreadId } : {}),
    ...(setup ? { setup } : {}),
  };
}

export function parseT3workViewFromPath(
  pathname: string,
  search?: Pick<T3workRouteSearch, "chatThreadId">,
): ViewState | null {
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
  const embeddedThreadId = search?.chatThreadId;

  if (segments.length === 2) {
    return {
      type: "dashboard",
      projectId,
      ...(embeddedThreadId ? { embeddedThreadId } : {}),
    };
  }

  if (segments.length === 4 && segments[2] === T3WORK_TICKET_SEGMENT && segments[3]) {
    return {
      type: "ticket",
      projectId,
      ticketId: segments[3],
      ...(embeddedThreadId ? { embeddedThreadId } : {}),
    };
  }

  if (segments.length === 3 && segments[2] === T3WORK_RECIPES_SEGMENT) {
    return {
      type: "recipes",
      projectId,
      ...(embeddedThreadId ? { embeddedThreadId } : {}),
    };
  }

  if (segments.length === 4 && segments[2] === T3WORK_THREAD_SEGMENT && segments[3]) {
    return { type: "thread", projectId, threadId: segments[3] };
  }

  return null;
}

export function resolveT3workRouteSearchTarget(pathname: string): T3workRouteSearchTarget | null {
  if (pathname === T3WORK_BASE_PATH) {
    return { to: "/t3work" };
  }

  if (pathname === T3WORK_CREATE_PATH) {
    return { to: "/t3work/new" };
  }

  const view = parseT3workViewFromPath(pathname);
  if (!view) {
    return null;
  }

  if (view.type === "dashboard") {
    return {
      to: "/t3work/projects/$projectId",
      params: { projectId: view.projectId },
    };
  }

  if (view.type === "ticket") {
    return {
      to: "/t3work/projects/$projectId/tickets/$ticketId",
      params: { projectId: view.projectId, ticketId: view.ticketId },
    };
  }

  if (view.type === "recipes") {
    return {
      to: "/t3work/projects/$projectId/recipes",
      params: { projectId: view.projectId },
    };
  }

  return {
    to: "/t3work/projects/$projectId/threads/$threadId",
    params: { projectId: view.projectId, threadId: view.threadId },
  };
}
