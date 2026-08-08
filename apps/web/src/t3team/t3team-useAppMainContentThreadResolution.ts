import type { ProjectShellProject } from "@t3tools/project-context";

import { useProjectWorkspaceAutoSync } from "~/t3team/hooks/t3team-useProjectWorkspaceAutoSync";
import { useSyncActiveChatTarget } from "~/t3team/t3team-AppMainContentShell";
import {
  resolveEmbeddedThread,
  resolveThreadProject,
} from "~/t3team/t3team-appMainContentResolution";
import { readActiveThreadIdFromView, type ProjectThread, type ViewState } from "~/t3team/t3team-types";
import { useThreadResolutionDebug } from "~/t3team/t3team-useThreadResolutionDebug";
import { readProjectIdFromView } from "~/t3team/t3team-types";

/**
 * Resolves the active thread/project for the current route view and keeps the
 * active-chat-target sync, workspace auto-sync, and thread-resolution debug
 * effects running alongside that resolution. Extracted from AppMainContent so
 * that component stays under the t3team-* additive line cap; hook call order
 * here mirrors the order these hooks previously ran in that component.
 */
export function useAppMainContentThreadResolution(input: {
  view: ViewState | null;
  allProjects: ProjectShellProject[];
  homeProject: ProjectShellProject | null;
  homeChatProject: ProjectShellProject | null;
  homeChatThreadId: string | null;
  getThreadsForProject: (projectId: string) => ProjectThread[];
}) {
  const { view, allProjects, homeProject, homeChatProject, homeChatThreadId, getThreadsForProject } =
    input;

  useSyncActiveChatTarget({
    view,
    getThreadsForProject,
    homeChatProject,
    homeChatThreadId,
  });

  const activeThreadId = readActiveThreadIdFromView(view);
  const threadProject = resolveThreadProject({
    activeThreadId,
    view,
    allProjects,
    homeChatProject,
  });
  const threadProjectThreads = threadProject ? getThreadsForProject(threadProject.id) : [];
  const resolvedThread = activeThreadId
    ? (threadProjectThreads.find((candidate) => candidate.id === activeThreadId) ?? null)
    : null;
  const embeddedThread = resolveEmbeddedThread(view, threadProjectThreads);
  const viewProject = view
    ? (allProjects.find((candidate) => candidate.id === readProjectIdFromView(view)) ?? null)
    : null;
  const workspaceSyncProject = threadProject ?? viewProject ?? homeProject;
  const workspaceSyncProjectThreads = workspaceSyncProject
    ? getThreadsForProject(workspaceSyncProject.id)
    : [];

  useProjectWorkspaceAutoSync({
    project: workspaceSyncProject,
    projectThreads: workspaceSyncProjectThreads,
  });

  useThreadResolutionDebug({
    routeProjectId: readProjectIdFromView(view ?? null),
    routeThreadId: activeThreadId,
    resolvedProjectId: threadProject?.id ?? null,
    resolvedProjectWorkspaceRoot: threadProject?.workspace?.rootPath ?? null,
    projectThreadCount: threadProjectThreads.length,
    resolvedThreadId: resolvedThread?.id ?? null,
    resolvedThreadProjectId: resolvedThread?.projectId ?? null,
    resolvedThreadStatus: resolvedThread?.status ?? null,
    kickoffPending: resolvedThread?.kickoffPending ?? null,
  });

  return { activeThreadId, threadProject, resolvedThread, embeddedThread, viewProject };
}
