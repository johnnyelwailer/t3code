import type { T3TeamMessageWorkflowAuthor } from "@t3tools/contracts";
import type { AskAffordance } from "@t3team/sdk";

/** Which ask kind a thread is parked on — selects the event that resolves it. */
export type WorkflowPendingKind = "thread.turn" | "user.input";

export interface WorkflowPendingAsk {
  readonly runId: string;
  readonly correlationId: string;
  readonly kind: WorkflowPendingKind;
  /** The `user.input` ask's affordance descriptor, so the resolve route can reject a
   * structured value that does not fit the offered choices BEFORE posting the reply. Hot-index
   * only (not persisted): after a restart-rehydration it is absent and the route check degrades
   * gracefully — the SDK still schema-validates the reply on resume. */
  readonly affordance?: AskAffordance;
  /**
   * The attribution stamped on this step's prompt, reused to stamp the assistant messages that
   * ANSWER it — so a step's prompt and its answer carry the same run id, step id and label, and a
   * client can collapse both under one label. Hot-index only, like `affordance`: a run rehydrated
   * after a restart has no author, and its answers stay unattributed rather than guessing a label.
   */
  readonly author?: T3TeamMessageWorkflowAuthor;
  /** Black-boxed composition asks settle in-memory inside the still-running composition. */
  readonly resolveLive?: (reply: unknown) => Promise<void>;
  /** Authoring retains partial output even when the provider turn fails. */
  readonly retainTurnDraft?: boolean;
  /** Settle an in-memory waiter when its owning run is cancelled. */
  readonly cancelLive?: () => void;
  /**
   * Present when the ask was rehydrated from the `workflow_runs` row after a restart
   * (`turn_retries`, migration 052) or re-armed by a re-drive — never set by the live broker.
   * It carries the journaled re-drive count so a no-text settle re-drives the step instead of
   * failing the run, up to the bounded budget (see t3team-workflowEngineTurnRetry.ts). A live
   * step that simply says nothing still fails the run.
   */
  readonly turnRetries?: number;
  /**
   * The prompt message of the CURRENT attempt of a `thread.turn` step: the run it starts or
   * queues is the run whose terminal status settles the step (t3team-workflowTurnRun.ts). Set by
   * the broker and by a re-drive BEFORE they dispatch, so a check that races the dispatch waits
   * instead of declaring the prompt lost. Hot-index only: a rehydrated ask recovers it from the
   * thread by the prompt's workflow author stamp (t3team-workflowTurnPrompt.ts).
   */
  readonly promptMessageId?: string;
  /**
   * Set while a re-drive of this step is scheduled (t3team-workflowEngineTurnRetry.ts): the dead
   * run it answers stays dead until the re-drive posts a new prompt, so checks in between must
   * not judge it again (each would burn another attempt of the budget). Hot-index only.
   */
  readonly redriveScheduled?: boolean;
}
