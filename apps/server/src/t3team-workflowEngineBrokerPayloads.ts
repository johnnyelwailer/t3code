/**
 * The payload shapes the SDK's thread, model, timer and signal verbs put on the wire to the
 * workflow-engine broker (split out of `t3team-workflowEngineBrokerTypes.ts`, which re-exports
 * them, for the prefixed-file LOC ceiling). Types only.
 */
import type { AskAffordance, ModelSelection as WorkflowModelSelection } from "@t3team/sdk";

/** The `signal.register` envelope payload: the run's binding to one source instance. `params`
 * is the author's validated params (host-validated at bind time against the source's params
 * schema); `paramsHash` is the canonical-JSON hash forming the instance-identity half. */
export interface SignalRegisterPayload {
  readonly source: string;
  readonly params: unknown;
  readonly paramsHash: string;
}

/** The `signal.wait` envelope payload: the awaited `(signal, key)` within one source instance. */
export interface SignalWaitPayload {
  readonly source: string;
  readonly paramsHash: string;
  readonly signal: string;
  readonly key: string;
}

/** The `signal.waitAny` envelope payload: every branch, in branch order — the winner's index
 * refers to this list. Each branch has the shape of a single `signal.wait`. */
export interface SignalWaitAnyPayload {
  readonly branches: ReadonlyArray<SignalWaitPayload>;
}

export interface ThreadCreatePayload {
  readonly threadId: string;
  readonly name?: string;
  readonly model?: WorkflowModelSelection;
  /** Broker-only provenance: injected host defaults do not pin the catalog model. */
  readonly modelIsDefault?: boolean;
  /** Provider-agnostic thinking level; see `resolveWorkflowChildModel`. */
  readonly effort?: import("@t3team/sdk").AgentEffort;
  /** Omitted is ephemeral, preserving one-shot agent() as a hidden child. */
  readonly retention?: "ephemeral" | "retained";
  /** `launch-thread` puts the child in the launch thread's checkout; omitted is the project root. */
  readonly checkout?: "project" | "launch-thread";
}
export interface ThreadTurnPayload {
  readonly threadId: string;
  readonly prompt: string;
  readonly model?: WorkflowModelSelection;
  /** Broker-only provenance: injected host defaults do not pin the catalog model. */
  readonly modelIsDefault?: boolean;
  /** Short human-facing status label, separate from the provider prompt. */
  readonly label?: string;
  /** Provider-agnostic thinking level; see `resolveWorkflowChildModel`. */
  readonly effort?: import("@t3team/sdk").AgentEffort;
  /** The author's structured data, named by the SDK and journaled as structure; the host
   * serializes it into the turn text (`workflowTurnText`). Absent on older journals. */
  readonly attachments?: ReadonlyArray<import("@t3team/sdk").NamedAttachment>;
}
export interface ThreadMessagePayload {
  readonly threadId: string;
  readonly recipient: "agent" | "user";
  readonly text: string;
  readonly widget?: {
    readonly title: string;
    readonly widgetCode?: string;
    readonly intent?: string;
    readonly format?: "html" | "svg";
    readonly loadingMessages?: ReadonlyArray<string>;
  };
  /** `Thread.showView` (`@runbook/threads`); handled by t3team-workflowEngineBrokerShowView.ts. */
  readonly view?: import("@t3team/sdk").ShowViewInput;
}
export interface UserInputPayload {
  readonly threadId: string;
  readonly question: string;
  /** Short human-facing status label, separate from the user question. */
  readonly label?: string;
  /** Serializable descriptor of the reply affordance, derived from the ask's schema by the
   * SDK (`schemaToAffordance`). Absent on payloads from older journals → treated as text. */
  readonly affordance?: AskAffordance;
  /** External-resource refs to render as cards on the decision message. */
  readonly attachments?: ReadonlyArray<unknown>;
}
/**
 * The `model.resolve` envelope payload: the author's provider ladder (`{ models: [...] }`), in
 * wire form. Resolved host-side against the live registry; the chosen selection is the
 * primitive's journaled reply, so replays reuse it instead of re-probing.
 */
export interface ModelResolvePayload {
  readonly entries: ReadonlyArray<import("@t3team/sdk").ModelCascadeWireEntry>;
}
/** The `wait.until` envelope payload: the wall-clock deadline (epoch millis) the run sleeps to. */
export interface WaitUntilPayload {
  readonly deadline: number;
}

/** `launchThread(opts)` as the SDK sends it (t3team-sdk.launchedThreads.ts). */
export interface LaunchThreadPayload {
  readonly key: string;
  readonly title: string;
  readonly message?: string;
  readonly model?: import("@t3team/sdk").ModelOption;
  readonly runtimeMode?: string;
  readonly interactionMode?: string;
  readonly workspace?: import("./t3team-workflowHostPort.ts").WorkflowHostLaunchWorkspace;
}

/** One verb on a launched thread, addressed by the id and key `launchThread` returned. */
export type LaunchedThreadOpPayload = { readonly threadId: string; readonly key: string } & (
  | { readonly op: "watch"; readonly url: string; readonly watching: boolean }
  | { readonly op: "send"; readonly text: string }
  | {
      readonly op: "configure";
      readonly model?: import("@t3team/sdk").ModelOption;
      readonly runtimeMode?: string;
    }
  | { readonly op: "read" }
  | { readonly op: "facts"; readonly extensions: Readonly<Record<string, unknown>> }
);

export interface RunFactsPayload {
  readonly extensions: Readonly<Record<string, unknown>>;
}
