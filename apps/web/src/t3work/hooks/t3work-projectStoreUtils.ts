import type { ProjectShellProject } from "@t3tools/project-context";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { Project } from "~/types";
import { MOCK_TICKETS } from "~/t3work/data/t3work-mockThreads";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type {
  ProjectThread,
  ProjectThreadDisplayMode,
  T3workKickoffWorkflow,
  T3workThreadToolId,
} from "~/t3work/t3work-types";
import {
  normalizeWorkspaceRootPath,
  readLiveProjectRoots,
  readOwnedWorkspaceRoots,
} from "./t3work-threadBridge";

let projectIdCounter = 0;
let threadIdCounter = 0;

const STORAGE_KEY = "t3work:projects";

export function generateProjectId(): string {
  projectIdCounter += 1;
  return `proj-${projectIdCounter}`;
}

export function generateThreadId(): string {
  threadIdCounter += 1;
  return `thread-${Date.now()}-${threadIdCounter}`;
}

export function buildThreadForProject(
  projectId: string,
  options?: {
    title?: string;
    ticketId?: string;
    ticketDisplayId?: string;
    dashboardMode?: ProjectDashboardMode;
    viewMode?: ProjectThreadDisplayMode;
    kickoffMessage?: string;
    kickoffPending?: boolean;
    kickoffModelSelection?: ModelSelection;
    kickoffRuntimeMode?: RuntimeMode;
    kickoffInteractionMode?: ProviderInteractionMode;
    selectedToolIds?: ReadonlyArray<T3workThreadToolId>;
    kickoffWorkflow?: T3workKickoffWorkflow;
  },
): ProjectThread {
  const now = new Date().toISOString();
  return {
    id: generateThreadId(),
    projectId,
    ...(options?.ticketId ? { ticketId: options.ticketId } : {}),
    ...(options?.ticketDisplayId ? { ticketDisplayId: options.ticketDisplayId } : {}),
    ...(options?.dashboardMode ? { dashboardMode: options.dashboardMode } : {}),
    ...(options?.viewMode ? { displayMode: options.viewMode } : {}),
    title: options?.title ?? "New thread",
    status: "idle",
    lastMessageAt: now,
    messageCount: 0,
    createdAt: now,
    ...(options?.kickoffMessage ? { kickoffMessage: options.kickoffMessage } : {}),
    ...(options?.kickoffPending !== undefined ? { kickoffPending: options.kickoffPending } : {}),
    ...(options?.kickoffModelSelection
      ? { kickoffModelSelection: options.kickoffModelSelection }
      : {}),
    ...(options?.kickoffRuntimeMode ? { kickoffRuntimeMode: options.kickoffRuntimeMode } : {}),
    ...(options?.kickoffInteractionMode
      ? { kickoffInteractionMode: options.kickoffInteractionMode }
      : {}),
    ...(options?.selectedToolIds !== undefined ? { selectedToolIds: options.selectedToolIds } : {}),
    ...(options?.kickoffWorkflow ? { kickoffWorkflow: options.kickoffWorkflow } : {}),
  };
}

function projectSourceKey(project: ProjectShellProject): string {
  return [
    project.source.provider,
    project.source.accountId ?? "",
    project.source.externalProjectId ?? project.id,
  ].join(":");
}

function dedupeProjects(projects: ProjectShellProject[]): ProjectShellProject[] {
  const bySourceKey = new Map<string, ProjectShellProject>();
  for (const project of projects) {
    bySourceKey.set(projectSourceKey(project), project);
  }
  return [...bySourceKey.values()];
}

function synthesizeLooseWorkspaceProject(project: Project): ProjectShellProject {
  const createdAt = project.createdAt ?? new Date().toISOString();
  const updatedAt = project.updatedAt ?? createdAt;
  const title = project.name.trim() || project.cwd;
  return {
    id: project.id as never,
    title,
    source: {
      provider: "local",
      externalProjectId: project.id,
      externalProjectKey: project.name,
      raw: {
        environmentId: project.environmentId,
      },
    },
    workspace: {
      rootPath: project.cwd,
      createdAt,
    },
    createdAt,
    updatedAt,
  };
}

export function deriveLooseWorkspaceProjects(
  storedProjects: ReadonlyArray<ProjectShellProject>,
  liveProjects: ReadonlyArray<Project>,
): ProjectShellProject[] {
  const workspaceRoots = new Set(storedProjects.flatMap(readOwnedWorkspaceRoots));
  const storedProjectIds = new Set(storedProjects.map((project) => String(project.id)));
  return liveProjects.flatMap((project) => {
    if (storedProjectIds.has(String(project.id))) {
      return [];
    }

    if (readLiveProjectRoots(project).some((root) => workspaceRoots.has(root))) {
      return [];
    }
    return [synthesizeLooseWorkspaceProject(project)];
  });
}

export function loadStoredProjects(): ProjectShellProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return dedupeProjects(JSON.parse(raw) as ProjectShellProject[]);
  } catch {
    return [];
  }
}

export function saveStoredProjects(projects: ProjectShellProject[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function upsertProjectBySource(
  projects: ProjectShellProject[],
  project: ProjectShellProject,
): ProjectShellProject[] {
  const existingIndex = projects.findIndex(
    (candidate) => projectSourceKey(candidate) === projectSourceKey(project),
  );
  return existingIndex >= 0
    ? projects.map((candidate, index) => (index === existingIndex ? project : candidate))
    : [...projects, project];
}

export function getMockTicketsForProject(project: ProjectShellProject) {
  const extId = project.source.externalProjectId;
  return MOCK_TICKETS.filter((ticket) => {
    if (extId === "jira-proj-einb") return ticket.projectId === "proj-einb";
    if (extId === "jira-proj-checkout") return ticket.projectId === "proj-ac";
    if (extId === "jira-proj-support") return ticket.projectId === "proj-csp";
    return false;
  });
}
