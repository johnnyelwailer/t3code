import type { ProjectShellProject } from "@t3tools/project-context";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { MOCK_TICKETS } from "~/t3work/data/t3work-mockThreads";
import type { ProjectThread } from "~/t3work/t3work-types";

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
    kickoffMessage?: string;
    kickoffPending?: boolean;
    kickoffModelSelection?: ModelSelection;
    kickoffRuntimeMode?: RuntimeMode;
    kickoffInteractionMode?: ProviderInteractionMode;
  },
): ProjectThread {
  const now = new Date().toISOString();
  return {
    id: generateThreadId(),
    projectId,
    ...(options?.ticketId ? { ticketId: options.ticketId } : {}),
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
