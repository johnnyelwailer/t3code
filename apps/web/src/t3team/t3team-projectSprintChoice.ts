/**
 * The user's EXPLICIT board/sprint pick per project, shared by every view
 * (backlog, planning space, kanban, My Work digest).
 *
 * Only real user actions write here. Server auto-picks are never persisted as
 * a choice — that used to freeze whatever sprint was current the first time a
 * view loaded (e.g. a closed 8.5) into the backlog state forever. Without a
 * choice, every surface asks the shared resolver
 * (@t3tools/integrations-atlassian/sprintResolver) and gets the same answer.
 */

export type ProjectSprintChoice = {
  readonly boardId?: string;
  readonly sprintId?: string;
};

const KEY_PREFIX = "t3team:sprint-choice:v1:";
export const PROJECT_SPRINT_CHOICE_EVENT = "t3team:sprint-choice-changed";

export function projectSprintChoiceKey(projectId: string): string {
  return `${KEY_PREFIX}${projectId}`;
}

function storage(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readProjectSprintChoice(projectId: string): ProjectSprintChoice | undefined {
  const raw = storage()?.getItem(projectSprintChoiceKey(projectId));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { boardId?: unknown; sprintId?: unknown };
    const boardId = typeof parsed.boardId === "string" && parsed.boardId ? parsed.boardId : undefined;
    const sprintId =
      typeof parsed.sprintId === "string" && parsed.sprintId ? parsed.sprintId : undefined;
    if (!boardId && !sprintId) return undefined;
    return { ...(boardId ? { boardId } : {}), ...(sprintId ? { sprintId } : {}) };
  } catch {
    return undefined;
  }
}

export function writeProjectSprintChoice(
  projectId: string,
  choice: ProjectSprintChoice | undefined,
): void {
  const store = storage();
  if (!store) return;
  const key = projectSprintChoiceKey(projectId);
  if (!choice || (!choice.boardId && !choice.sprintId)) store.removeItem(key);
  else store.setItem(key, JSON.stringify(choice));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROJECT_SPRINT_CHOICE_EVENT, { detail: { projectId } }));
  }
}
