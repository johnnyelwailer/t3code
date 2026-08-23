/**
 * Thread run status — the one server-side read-model primitive that derives a
 * compact, provider-agnostic "what is this thread doing right now" record from
 * an `OrchestrationThreadShell`.
 *
 * Two consumers by design (GHE #55 + #52): the `t3team.thread.children` tool
 * (list/status ops) and the sidebar's per-row status. Both read the SAME shell
 * fields through this single function so the tool and the UI can never drift
 * into disagreeing about whether a thread is running, done, or dead.
 *
 * The state vocabulary is the tool's, not the sidebar's:
 *   running  — a turn is in flight (session running/starting, or latestTurn running)
 *   completed— the last turn settled cleanly (idle/ready)
 *   failed   — the last turn or session ended in error
 *   aborted  — the last turn was interrupted/stopped (user stop, cascade, crash-stop)
 *   idle     — nothing has run yet, or no turn signal is present
 *
 * A dead child therefore surfaces as `failed` (session error) rather than
 * silence: the mapping is total over the shell's session/turn states.
 *
 * @module threadRunStatus
 */
import type { OrchestrationThreadShell } from "@t3tools/contracts";

export type ThreadRunState = "running" | "idle" | "failed" | "completed" | "aborted";

/** The shell fields the primitive reads. `Pick` keeps it decoupled from the
 *  full shell while staying structurally compatible with it. */
export type ThreadRunStatusInput = Pick<
  OrchestrationThreadShell,
  | "id"
  | "title"
  | "modelSelection"
  | "branch"
  | "worktreePath"
  | "latestTurn"
  | "session"
  | "createdAt"
  | "updatedAt"
  | "backgroundLiveness"
  | "planProgress"
  | "childStatus"
>;

export interface ThreadRunStatus {
  readonly threadId: string;
  readonly title: string;
  readonly state: ThreadRunState;
  readonly provider: string | null;
  readonly model: string | null;
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  /** The last turn's settled state, when a turn has run. */
  readonly latestTurnState: string | null;
  readonly latestTurnStartedAt: string | null;
  readonly latestTurnCompletedAt: string | null;
  /** The current plan step while a turn runs (the in-progress work label). */
  readonly inProgressToolCall: string | null;
  /** Background-only summary of meaningful child work, when present. */
  readonly childStatus: string | null;
}

/**
 * Map a shell's session + latest-turn state onto the tool's five-state
 * vocabulary. Precedence mirrors the sidebar's status model: a live session
 * outranks everything; a failed session outranks a stale running turn (a dead
 * child reads `failed`, not a stale `running`); a live background fleet
 * outlives the settled turn and reads `running`.
 */
export function deriveThreadRunState(input: {
  readonly session: { readonly status: string } | null;
  readonly latestTurn: { readonly state: string } | null;
  readonly backgroundLiveness?: "working" | "monitoring" | null | undefined;
}): ThreadRunState {
  const sessionStatus = input.session?.status;
  const turnState = input.latestTurn?.state;
  if (sessionStatus === "running" || sessionStatus === "starting") {
    return "running";
  }
  if (sessionStatus === "error") {
    return "failed";
  }
  if (sessionStatus === "interrupted" || sessionStatus === "stopped") {
    return "aborted";
  }
  if (turnState === "running") {
    return "running";
  }
  if (turnState === "error") {
    return "failed";
  }
  if (turnState === "interrupted") {
    return "aborted";
  }
  // Background work outlives the turn: a live fleet reads as running even after
  // the turn has settled.
  if (input.backgroundLiveness === "working") {
    return "running";
  }
  if (turnState === "completed") {
    return "completed";
  }
  return "idle";
}

export function deriveThreadRunStatus(shell: ThreadRunStatusInput): ThreadRunStatus {
  const modelSelection = shell.modelSelection;
  return {
    threadId: shell.id,
    title: shell.title,
    state: deriveThreadRunState({
      session: shell.session,
      latestTurn: shell.latestTurn,
      ...(shell.backgroundLiveness !== undefined
        ? { backgroundLiveness: shell.backgroundLiveness }
        : {}),
    }),
    provider: modelSelection ? String(modelSelection.instanceId) : null,
    model: modelSelection ? modelSelection.model : null,
    createdAt: shell.createdAt,
    lastActivityAt: shell.updatedAt,
    branch: shell.branch,
    worktreePath: shell.worktreePath,
    latestTurnState: shell.latestTurn?.state ?? null,
    latestTurnStartedAt: shell.latestTurn?.startedAt ?? null,
    latestTurnCompletedAt: shell.latestTurn?.completedAt ?? null,
    inProgressToolCall: shell.planProgress?.step ?? null,
    childStatus: shell.childStatus ?? null,
  };
}
