/**
 * The workflow engine's view of its host: the handful of thread operations a workflow run
 * performs, as Promise functions the Promise-based engine (broker, controller, run lifecycle)
 * calls. Every orchestration detail lives behind it in `t3team-workflowHost.ts`; the engine never
 * builds an orchestration command itself.
 *
 * Types only, importing nothing from the engine, so it cannot take part in an import cycle.
 */
import type { ResolvedRecipeConfig } from "@t3team/sdk";
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
  /**
   * Work in the parent's branch and worktree instead of the project root. Opt-in per child
   * (`agent(prompt, { checkout: "launch-thread" })`), so existing workflows keep the root.
   */
  readonly inheritCheckout?: boolean;
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

/** Where a launched thread works; `ThreadLaunchService`'s workspace strategies. */
export type WorkflowHostLaunchWorkspace =
  | { readonly type: "root" }
  | {
      readonly type: "worktree";
      readonly baseRef: string;
      readonly branch?: string;
      readonly startFromOrigin?: boolean;
    };

/** Who may address a launched thread: the project, the run's launch scope and the key. */
export interface WorkflowHostLaunchedThreadOwner {
  /** The calling run, recorded on the thread and on the messages it sends there. */
  readonly runId: string;
  readonly projectId: ProjectId;
  /** The run's recipe; the host scopes keys by its declared id (`recipe:<id>`), else the run. */
  readonly recipePath?: string;
  /** The run's modes: a thread above them takes no message or watch from it. */
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly key: string;
}

export interface WorkflowHostLaunchThreadInput extends WorkflowHostLaunchedThreadOwner {
  readonly launchThreadId?: string;
  readonly title: string;
  /** Sent as the first message only when this call creates the thread. */
  readonly message?: string;
  readonly modelSelection: ModelSelection;
  /** The launched thread's modes, already checked against the run's. */
  readonly threadRuntimeMode: RuntimeMode;
  readonly threadInteractionMode: ProviderInteractionMode;
  readonly workspace: WorkflowHostLaunchWorkspace;
}

export type WorkflowHostLaunchedThreadOp =
  | { readonly op: "watch"; readonly url: string; readonly watching: boolean }
  | { readonly op: "send"; readonly text: string }
  | {
      readonly op: "configure";
      readonly modelSelection?: ModelSelection;
      readonly runtimeMode?: RuntimeMode;
    }
  | { readonly op: "read" }
  | { readonly op: "facts"; readonly extensions: Readonly<Record<string, unknown>> };

export interface WorkflowHostLaunchedThreadInput extends WorkflowHostLaunchedThreadOwner {
  readonly threadId: string;
  /** The journaled request; stable across a re-fire, so each command it issues lands once. */
  readonly requestId: string;
  readonly op: WorkflowHostLaunchedThreadOp;
}

/** A host refusal the body sees as a `LaunchedThreadError`; anything thrown is a host failure. */
export type WorkflowHostLaunchAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export interface WorkflowHostRecipeConfigInput {
  readonly projectId: ProjectId;
  /** The run's recipe directory; its name is the recipe id the config file is named after. */
  readonly recipePath: string;
  readonly repository?: string;
  readonly caller?: Readonly<Record<string, unknown>>;
  readonly run?: Readonly<Record<string, unknown>>;
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
  /** Archive a host-owned thread (the retired orchestration author). */
  readonly archiveThread: (threadId: string) => Promise<void>;
  /** Refresh the launch thread's workflow run facts (status pill, sleeping-until). */
  readonly syncRunFacts: (launchThreadId: string) => Promise<void>;
  /** Launch or find a top-level thread by key (`launchThread`). */
  readonly launchThread: (
    input: WorkflowHostLaunchThreadInput,
  ) => Promise<WorkflowHostLaunchAnswer<{ readonly threadId: string; readonly created: boolean }>>;
  /** One verb on a thread this scope launched; refused for any other thread. */
  readonly launchedThread: (
    input: WorkflowHostLaunchedThreadInput,
  ) => Promise<WorkflowHostLaunchAnswer<unknown>>;
  /** The run's recipe config for one repository (G12); refused for a run without a recipe. */
  readonly resolveRecipeConfig: (
    input: WorkflowHostRecipeConfigInput,
  ) => Promise<WorkflowHostLaunchAnswer<ResolvedRecipeConfig>>;
  /** Merge pack `extensions` facts on the run's launch thread; `t3team.*` keys are refused. */
  readonly setRunFacts: (input: {
    readonly launchThreadId: string;
    readonly extensions: Readonly<Record<string, unknown>>;
  }) => Promise<WorkflowHostLaunchAnswer<void>>;
}

/** The timeline activity envelope an activity artifact carries (`WorkflowHostActivityInput`). */
export interface WorkflowHostActivityPayload {
  readonly tone: "info" | "error";
  readonly summary: string;
  readonly payload: unknown;
}
