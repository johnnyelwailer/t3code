/**
 * The workflow engine's view of its host: the handful of thread operations a workflow run
 * performs, as Promise functions the Promise-based engine (broker, controller, run lifecycle)
 * calls. Every orchestration detail lives behind it in `t3team-workflowHost.ts`; the engine never
 * builds an orchestration command itself.
 *
 * Types only, importing nothing from the engine, so it cannot take part in an import cycle.
 */
import type {
  ModelSelection,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
  T3TeamMessageAuthor,
  T3TeamMessageExt,
} from "@t3tools/contracts";

export interface WorkflowHostCreateThreadInput {
  readonly threadId: string;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  /** `ephemeral` threads (one-shot agents, repair helpers) are hidden from rosters once done. */
  readonly retention: "ephemeral" | "retained";
  /** The run's launch thread; the new thread is linked under it as a `subagent` child. */
  readonly parentThreadId?: string;
}

export interface WorkflowHostStartTurnInput {
  readonly threadId: string;
  /**
   * The prompt message id. The run that answers the step is the run this message starts (or
   * queues), so the reactor matches the answer by it — callers pick a unique id per attempt.
   */
  readonly messageId: string;
  readonly text: string;
  readonly modelSelection?: ModelSelection;
  /** Rides the prompt as its fork message ext, so a client can tell machine input from a person. */
  readonly author: T3TeamMessageAuthor;
}

export interface WorkflowHostMessageInput {
  readonly threadId: string;
  /** Re-posting the same id updates the message in place (latest text wins). */
  readonly messageId: string;
  readonly role: "user" | "assistant" | "system";
  /** Empty text posts only the ext's attachments (a bare widget). */
  readonly text: string;
  readonly ext?: T3TeamMessageExt;
  /**
   * Hold the message while the thread has an active run and post it once that run ends, so a
   * note written mid-run lands after the run instead of buried inside it.
   */
  readonly afterActiveRun?: boolean;
}

/** A keyed timeline fact (a workflow step pip, a run banner), upserted in place by `id`. */
export interface WorkflowHostActivityInput {
  readonly threadId: string;
  readonly id: string;
  readonly kind: string;
  readonly tone: "info" | "error";
  readonly summary: string;
  readonly payload: unknown;
}

export interface WorkflowHostInterruptInput {
  readonly threadId: string;
  readonly reason?: string;
  /**
   * `user` when a person's Stop drives it (the card's Stop, a Stop on the launch thread): it is
   * then stamped like the composer's Stop, so per-thread delivery holds treat it as one.
   */
  readonly origin?: "user" | "system";
}

export interface WorkflowHostPort {
  readonly createThread: (input: WorkflowHostCreateThreadInput) => Promise<void>;
  /** Queue a turn behind the thread's active run (starts at once on an idle thread). */
  readonly startTurn: (input: WorkflowHostStartTurnInput) => Promise<void>;
  /** Record a message without starting a turn. */
  readonly postMessage: (input: WorkflowHostMessageInput) => Promise<void>;
  readonly upsertActivity: (input: WorkflowHostActivityInput) => Promise<void>;
  /** Stop the thread's active run, if any. */
  readonly interrupt: (input: WorkflowHostInterruptInput) => Promise<void>;
  /** Refresh the launch thread's workflow run facts (status pill, sleeping-until). */
  readonly syncRunFacts: (launchThreadId: string) => Promise<void>;
}

/** The timeline activity envelope an activity artifact carries (`WorkflowHostActivityInput`). */
export interface WorkflowHostActivityPayload {
  readonly tone: "info" | "error";
  readonly summary: string;
  readonly payload: unknown;
}
