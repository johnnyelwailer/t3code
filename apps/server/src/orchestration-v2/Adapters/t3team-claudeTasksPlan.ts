/**
 * t3team Claude Tasks on the V2 adapter: TaskCreate/TaskUpdate/TaskList mutate one session-wide
 * task list, which the adapter re-projects as a todo_list plan (V1 parity, see
 * `de34391427^:apps/server/src/provider/Layers/ClaudeAdapter.ts` applyClaudeTaskToolResult).
 */
import type { OrchestrationV2PlanStep } from "@t3tools/contracts";

export interface ClaudeTaskState {
  readonly id: string;
  subject: string;
  status: OrchestrationV2PlanStep["status"];
  readonly blockedBy: Set<string>;
}

const CLAUDE_TASK_TOOL_NAMES = new Set(["TaskCreate", "TaskUpdate", "TaskList"]);

export function isClaudeTaskTool(toolName: string): boolean {
  return CLAUDE_TASK_TOOL_NAMES.has(toolName);
}

function claudeTaskStatus(value: unknown): OrchestrationV2PlanStep["status"] {
  return value === "completed" ? "completed" : value === "in_progress" ? "running" : "pending";
}

function claudeTaskString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function claudeTaskStringArray(value: unknown): ReadonlyArray<string> {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function claudeTaskRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Folds a successful TaskCreate/TaskUpdate/TaskList result into the session's
 * Claude Tasks list. Returns whether the list changed.
 */
export function applyClaudeTaskToolResult(
  tasks: Map<string, ClaudeTaskState>,
  toolName: string,
  toolInput: unknown,
  toolResult: unknown,
): boolean {
  if (!isClaudeTaskTool(toolName)) return false;
  const input = claudeTaskRecord(toolInput) ?? {};
  const result = claudeTaskRecord(toolResult);

  if (toolName === "TaskList") {
    const resultTasks = result?.tasks;
    if (!Array.isArray(resultTasks)) return false;
    tasks.clear();
    for (const entry of resultTasks) {
      const task = claudeTaskRecord(entry);
      const id = claudeTaskString(task?.id);
      const subject = claudeTaskString(task?.subject);
      if (id === undefined || subject === undefined) continue;
      tasks.set(id, {
        id,
        subject,
        status: claudeTaskStatus(task?.status),
        blockedBy: new Set(claudeTaskStringArray(task?.blockedBy)),
      });
    }
    return tasks.size > 0;
  }

  if (toolName === "TaskCreate") {
    const resultTask = claudeTaskRecord(result?.task);
    const id = claudeTaskString(resultTask?.id);
    const subject = claudeTaskString(resultTask?.subject) ?? claudeTaskString(input.subject);
    if (id === undefined || subject === undefined) return false;
    tasks.set(id, {
      id,
      subject,
      status: claudeTaskStatus(input.status),
      blockedBy: new Set(claudeTaskStringArray(input.blockedBy)),
    });
    return true;
  }

  const taskId = claudeTaskString(input.taskId) ?? claudeTaskString(result?.taskId);
  const task = taskId === undefined ? undefined : tasks.get(taskId);
  if (task === undefined) return false;
  let changed = false;
  const subject = claudeTaskString(input.subject);
  if (subject !== undefined && task.subject !== subject) {
    task.subject = subject;
    changed = true;
  }
  if (typeof input.status === "string") {
    const status = claudeTaskStatus(input.status);
    if (task.status !== status) {
      task.status = status;
      changed = true;
    }
  }
  for (const dependency of claudeTaskStringArray(input.addBlockedBy)) {
    if (!task.blockedBy.has(dependency)) {
      task.blockedBy.add(dependency);
      changed = true;
    }
  }
  for (const dependency of claudeTaskStringArray(input.removeBlockedBy)) {
    if (task.blockedBy.delete(dependency)) changed = true;
  }
  return changed;
}

export function claudeTaskPlanSteps(
  tasks: ReadonlyMap<string, ClaudeTaskState>,
): ReadonlyArray<OrchestrationV2PlanStep> {
  return Array.from(tasks.values(), (task) => {
    const blockedBy = Array.from(task.blockedBy);
    const blockedSuffix = blockedBy.length > 0 ? ` (blocked by #${blockedBy.join(", #")})` : "";
    return { id: `task-${task.id}`, text: `${task.subject}${blockedSuffix}`, status: task.status };
  });
}
