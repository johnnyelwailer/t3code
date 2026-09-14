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
 *   waiting  — own work is settled but a t3team child is still live (non-terminal,
 *              non-settled). The caller supplies that fact as `hasLiveChildren`
 *              from the durable parent/child relation; the primitive only applies
 *              the precedence: own live work still reads running/failed/aborted,
 *              so waiting replaces ONLY the would-be completed/idle.
 *
 * waiting is a STATE, not a side-channel flag, on purpose: both consumers
 * read `state`, and a flag would force each surface to re-apply the
 * precedence ("show Waiting only where it would say Done") — the exact
 * drift this module exists to prevent. The flags compose as separate facts:
 * `awaitingUserInput` says "a question is docked in THIS thread's composer";
 * `waitingDeclared` says "this thread explicitly blocked on a child's
 * result" — different resolution, different action, so one state with a
 * reason would conflate them.
 *
 * `awaitingParent` is the same flag discipline one hop over (full rationale
 * in `t3team-threadAwaitingParent`): plan-mode thread + cleanly settled
 * latest turn + an actionable (unimplemented) proposed plan says "the last
 * turn IS completed, but the parent owes this thread a decision". `state`
 * stays `completed` — a non-terminal "awaiting" state would conflate the
 * settled fact with the owed action and disturb the terminal predicates the
 * settle cascade and `wait` op build on.
 *
 * A dead child therefore surfaces as `failed` (session error) rather than
 * silence: the mapping is total over the shell's session/turn states.
 *
 * @module threadRunStatus
 */
import type { OrchestrationThreadShell } from "@t3tools/contracts";

import { deriveThreadAwaitingParent } from "./t3team-threadAwaitingParent.ts";

export type ThreadRunState = "running" | "idle" | "failed" | "completed" | "aborted" | "waiting";

/** Terminal run states: the thread's own work has settled (cleanly or not).
 *  A thread in any of these keeps no parent waiting; `waiting` itself is
 *  NON-terminal (the subtree is still live). */
export function isTerminalThreadRunState(state: ThreadRunState): boolean {
  return state === "completed" || state === "failed" || state === "aborted";
}

/** The shell fields the primitive reads. `Pick` keeps it decoupled from the
 *  full shell while staying structurally compatible with it. The optional
 *  extras are NOT in the Pick because detail loads (the status op) lack
 *  some of them: `hasPendingUserInput` and `hasActionableProposedPlan` are
 *  derived from activities/proposed-plans there; `hasLiveChildren` and
 *  `hasOpenChildWaits` are computed from durable relations/activities.
 */
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
  | "activityState"
  | "settledOverride"
  | "settledAt"
> & {
  readonly hasPendingUserInput?: boolean | undefined;
  readonly hasLiveChildren?: boolean | undefined;
  readonly interactionMode?: string | null;
  readonly hasActionableProposedPlan?: boolean | undefined;
  readonly hasOpenChildWaits?: boolean | undefined;
};

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
  /** Deterministic 4-state activity state while a turn runs (GHE #208); null when idle. */
  readonly activityState: string | null;
  /** The thread's settle marker: 'settled' threads keep transcripts but drop
   *   out of the active rosters (GHE #304); 'active' is the explicit keep-active pin. */
  readonly settledOverride: string | null;
  readonly settledAt: string | null;
  /** True while the shell reports a pending user-input request — a question
   *   docked in this thread's composer that the user has not answered.
   *   `awaitingParent` is the plan-mode twin: plan presented, turn settled,
   *   plan not yet implemented — the parent owes this thread a decision. */
  readonly awaitingUserInput: boolean;
  readonly awaitingParent: boolean;
  /**
   * The DECLARED waiting fact: a durable child wait registered on THIS thread
   * (`children op: wait`) is still pending — the thread explicitly blocked on
   * a child's result. The DERIVED twin (`hasLiveChildren` → state "waiting")
   * only says the children are still live; declared outranks derived for the
   * label ("Waiting" vs "Monitoring") but both keep the SAME state.
   */
  readonly waitingDeclared: boolean;
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
  readonly hasLiveChildren?: boolean | undefined;
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
  // Own work is settled but a t3team child is still live: the thread is
  // waiting on that work, not done. This is the ONLY place waiting can be
  // returned — every live/failed/aborted signal above already won.
  if (input.hasLiveChildren === true) {
    return "waiting";
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
      ...(shell.hasLiveChildren !== undefined ? { hasLiveChildren: shell.hasLiveChildren } : {}),
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
    activityState: shell.activityState ?? null,
    settledOverride: shell.settledOverride,
    settledAt: shell.settledAt,
    awaitingUserInput: shell.hasPendingUserInput === true,
    awaitingParent: deriveThreadAwaitingParent({
      interactionMode: shell.interactionMode,
      latestTurn: shell.latestTurn,
      hasActionableProposedPlan: shell.hasActionableProposedPlan,
    }),
    waitingDeclared: shell.hasOpenChildWaits === true,
  };
}
