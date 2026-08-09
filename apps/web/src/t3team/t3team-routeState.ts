import type { ProjectDashboardBacklogRouteSearch } from "~/t3team/t3team-projectDashboardBacklogState";
import { parseProjectDashboardBacklogRouteSearch } from "~/t3team/t3team-projectDashboardBacklogState";
import type { ProjectDashboardModeRouteSearch } from "~/t3team/t3team-projectDashboardModeState";
import { parseProjectDashboardModeRouteSearch } from "~/t3team/t3team-projectDashboardModeState";
import type { ProjectDashboardMyWorkRouteSearch } from "~/t3team/t3team-projectDashboardMyWorkState";
import { parseProjectDashboardMyWorkRouteSearch } from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectSidebarRouteSearch } from "~/t3team/t3team-projectSidebarState";
import { parseProjectSidebarRouteSearch } from "~/t3team/t3team-projectSidebarState";
import type { ViewState } from "~/t3team/t3team-types";

export const T3TEAM_BASE_PATH = "/t3team";
export const T3TEAM_CREATE_PATH = "/t3team/new";
const T3TEAM_PATH_SEGMENT = "projects";
const T3TEAM_TICKET_SEGMENT = "tickets";
const T3TEAM_THREAD_SEGMENT = "threads";
const T3TEAM_DRAFT_SEGMENT = "drafts";
const T3TEAM_ALL_MY_WORK_SEGMENT = "my-work";
const T3TEAM_CHAT_THREAD_SEARCH_KEY = "chatThreadId";
const T3TEAM_SETUP_SEARCH_KEY = "setup";
const T3TEAM_SETUP_WELCOME_VALUE = "welcome";

export type T3TeamRouteSearch = ProjectDashboardBacklogRouteSearch &
  ProjectDashboardMyWorkRouteSearch &
  ProjectDashboardModeRouteSearch &
  ProjectSidebarRouteSearch & {
    chatThreadId?: string;
    setup?: "welcome";
  };

export type T3TeamRouteSearchTarget =
  | { to: "/t3team" }
  | { to: "/t3team/my-work" }
  | { to: "/t3team/new" }
  | { to: "/t3team/drafts/$draftId"; params: { draftId: string } }
  | { to: "/t3team/projects/$projectId"; params: { projectId: string } }
  | {
      to: "/t3team/projects/$projectId/tickets/$ticketId";
      params: { projectId: string; ticketId: string };
    }
  | {
      to: "/t3team/projects/$projectId/threads/$threadId";
      params: { projectId: string; threadId: string };
    };

export function parseT3TeamRouteSearch(search: Record<string, unknown>): T3TeamRouteSearch {
  const rawChatThreadId = search[T3TEAM_CHAT_THREAD_SEARCH_KEY];
  const rawSetup = search[T3TEAM_SETUP_SEARCH_KEY];
  const chatThreadId =
    typeof rawChatThreadId === "string" && rawChatThreadId.length > 0 ? rawChatThreadId : null;
  const setup = rawSetup === T3TEAM_SETUP_WELCOME_VALUE ? T3TEAM_SETUP_WELCOME_VALUE : null;

  return {
    ...parseProjectDashboardBacklogRouteSearch(search),
    ...parseProjectDashboardMyWorkRouteSearch(search),
    ...parseProjectDashboardModeRouteSearch(search),
    ...parseProjectSidebarRouteSearch(search),
    ...(chatThreadId ? { chatThreadId } : {}),
    ...(setup ? { setup } : {}),
  };
}

export function parseT3TeamViewFromPath(
  pathname: string,
  search?: Pick<T3TeamRouteSearch, "chatThreadId">,
): ViewState | null {
  if (pathname === T3TEAM_BASE_PATH || pathname === T3TEAM_CREATE_PATH) {
    return null;
  }

  const suffix = pathname.startsWith(`${T3TEAM_BASE_PATH}/`)
    ? pathname.slice(T3TEAM_BASE_PATH.length + 1)
    : "";

  if (!suffix) {
    return null;
  }

  const segments = suffix.split("/").map((part) => decodeURIComponent(part));

  // The only project-less Team view: "my work" spanning every bound project.
  if (segments.length === 1 && segments[0] === T3TEAM_ALL_MY_WORK_SEGMENT) {
    return { type: "all-my-work" };
  }

  // Draft threads are routed by draft id alone; the project comes from the
  // composer draft store, which is the only place that knows it.
  if (segments.length === 2 && segments[0] === T3TEAM_DRAFT_SEGMENT && segments[1]) {
    return { type: "draft", draftId: segments[1] };
  }

  if (segments.length < 2 || segments[0] !== T3TEAM_PATH_SEGMENT || !segments[1]) {
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

  if (segments.length === 4 && segments[2] === T3TEAM_TICKET_SEGMENT && segments[3]) {
    return {
      type: "ticket",
      projectId,
      ticketId: segments[3],
      ...(embeddedThreadId ? { embeddedThreadId } : {}),
    };
  }

  if (segments.length === 4 && segments[2] === T3TEAM_THREAD_SEGMENT && segments[3]) {
    return {
      type: "thread",
      projectId,
      threadId: segments[3],
      ...(embeddedThreadId ? { embeddedThreadId } : {}),
    };
  }

  return null;
}

export function resolveT3TeamRouteSearchTarget(pathname: string): T3TeamRouteSearchTarget | null {
  if (pathname === T3TEAM_BASE_PATH) {
    return { to: "/t3team" };
  }

  if (pathname === T3TEAM_CREATE_PATH) {
    return { to: "/t3team/new" };
  }

  const view = parseT3TeamViewFromPath(pathname);
  if (!view) {
    return null;
  }

  if (view.type === "all-my-work") {
    return { to: "/t3team/my-work" };
  }

  if (view.type === "draft") {
    return {
      to: "/t3team/drafts/$draftId",
      params: { draftId: view.draftId },
    };
  }

  if (view.type === "dashboard") {
    return {
      to: "/t3team/projects/$projectId",
      params: { projectId: view.projectId },
    };
  }

  if (view.type === "ticket") {
    return {
      to: "/t3team/projects/$projectId/tickets/$ticketId",
      params: { projectId: view.projectId, ticketId: view.ticketId },
    };
  }

  return {
    to: "/t3team/projects/$projectId/threads/$threadId",
    params: { projectId: view.projectId, threadId: view.threadId },
  };
}
