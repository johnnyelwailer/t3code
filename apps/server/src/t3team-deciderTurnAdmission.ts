import type { OrchestrationCommand, OrchestrationThread } from "@t3tools/contracts";

/**
 * Per-thread turn admission (Codex adversarial review, HIGH).
 *
 * The finding was that automated turn starts — actor delivery, a workflow step,
 * a child kickoff — can race each other and double-submit one thread. It is NOT
 * about the user sending a second message: that is a *steer*, which the provider
 * adapters fold into the active turn and which upstream admits unconditionally.
 *
 * The original guard keyed on session status alone, so it caught steers too.
 * Upstream's "Preserve connecting status while a turn starts" (#4101) then made
 * `session.status` go to `"starting"` for the whole provider-startup window,
 * which turned that over-reach into rejected user turns.
 *
 * So admission discriminates by *origin* instead. `message.t3teamExt.author` is
 * fork-owned and only ever set by fork-side automated senders, which keeps this
 * decision independent of however upstream evolves session status next.
 *
 * For automated turns the busy test stays deliberately wide. In particular
 * `"starting"` must remain part of it: `thread.turn-start-requested` sets
 * `turnStartPending`, but the projector clears that flag on *any*
 * `thread.session-set`, and since #4101 the reactor emits one at the START of a
 * turn start. `turnStartPending` therefore no longer covers provider startup —
 * `"starting"` is what covers it now.
 */

type TurnStartCommand = Extract<OrchestrationCommand, { type: "thread.turn.start" }>;

/** A turn a fork subsystem started on the user's behalf, rather than a typed message. */
export function isAutomatedTurnStart(command: TurnStartCommand): boolean {
  return command.message.t3teamExt?.author !== undefined;
}

export function isThreadTurnBusy(
  thread: Pick<OrchestrationThread, "session" | "latestTurn" | "turnStartPending">,
): boolean {
  const sessionStatus = thread.session?.status;
  return (
    thread.turnStartPending === true ||
    sessionStatus === "starting" ||
    sessionStatus === "running" ||
    thread.latestTurn?.state === "running"
  );
}

/**
 * `false` means the decider must reject the command with
 * `OrchestrationCommandInvariantError`.
 */
export function admitsTurnStart(input: {
  readonly command: TurnStartCommand;
  readonly thread: Pick<OrchestrationThread, "session" | "latestTurn" | "turnStartPending">;
}): boolean {
  return !isAutomatedTurnStart(input.command) || !isThreadTurnBusy(input.thread);
}
