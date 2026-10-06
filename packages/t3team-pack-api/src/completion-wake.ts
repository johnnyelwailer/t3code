/**
 * Delegated-completion wake rendering (capability `completion-wake-renderer:v1`).
 *
 * When delegated tasks (child threads started with `delegate_task`) reach a terminal state, the
 * host wakes the parent thread with an automated turn. Its default text only names the task ids
 * and points at `task_status`. A pack that drives an orchestrating agent can register a renderer
 * that writes the whole wake instead: each task's status, title and result inline, so the agent
 * learns what happened without a tool round trip.
 *
 * The renderer must be fast and side-effect free; it runs on the host's continuation worker.
 * A rejection, a non-string result or a slow render falls back to `defaultText` — the wake is
 * never dropped.
 *
 * @module completion-wake
 */

/** One delegated task of the wake. `status` is the host subagent status. */
export type CompletionWakeTask = {
  readonly taskId: string;
  readonly childThreadId: string | null;
  readonly title: string | null;
  readonly status:
    | "idle"
    | "pending"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted";
  /** The child's final answer (its last assistant message), when it produced one. */
  readonly result: string | null;
};

export type CompletionWakeRenderInput = {
  /** The parent (orchestrating) thread that is woken. */
  readonly threadId: string;
  readonly parentRunId: string;
  /** The host's own text for this wake; return it to keep the default. */
  readonly defaultText: string;
  readonly tasks: readonly CompletionWakeTask[];
};

export type CompletionWakeRendererDefinition = {
  readonly render: (input: CompletionWakeRenderInput) => string | Promise<string>;
};
