/**
 * Pack provider orchestration contract (provider-driver schemaVersion 2).
 *
 * A pack provider is an orchestration V2 provider adapter expressed in
 * Promise / AsyncIterable form. Every method maps one-to-one onto the host's
 * `ProviderAdapterV2Shape` / `ProviderAdapterV2SessionRuntime`
 * (`apps/server/src/orchestration-v2/ProviderAdapter.ts`); the host only
 * converts Promises to Effects and JSON to typed values. There is no event
 * translation: the pack emits V2 adapter events itself.
 *
 * Every entity crosses the boundary in its canonical JSON form (the
 * `Schema.toCodecJson` encoding of the named `@t3tools/contracts` schema:
 * timestamps are ISO strings, branded ids are plain strings). The host decodes
 * everything the pack returns or emits against those schemas; a value that
 * does not decode fails the call with the matching adapter error.
 *
 * @module provider-orchestration
 */
import type { PackJobControlRequest, PackJobControlResult } from "./provider-driver.ts";

/** Canonical JSON of a host contracts entity; the doc comment names its schema. */
export type PackJson = { readonly [key: string]: unknown };

/** JSON of a host `ModelSelection` (`{ instanceId, model, options? }`). */
export type PackModelSelection = PackJson;

/** Host `ProviderAdapterV2RuntimePolicy` as JSON. */
export type PackRuntimePolicy = {
  readonly runtimeMode: string;
  readonly interactionMode: string;
  readonly cwd: string | null;
  readonly approvalPolicy?: unknown;
  readonly sandboxPolicy?: unknown;
  readonly reasoningEffort?: string;
};

/**
 * Host `ProviderAdapterV2TurnMessage`. `createdBy`/`creationSource` say who
 * started the turn: `"user"` for a typed message, `"agent"` for automated
 * input such as a delegated-task completion wake (`creationSource: "server"`),
 * an agent-to-agent message (`"mcp"`, `senderThreadId` set) or a provider
 * continuation the pack requested (`"provider"`). A pack must run every turn;
 * none of them may be dropped as "not from the user".
 */
export type PackTurnMessage = {
  readonly messageId: string;
  readonly text: string;
  /** JSON of host `ChatAttachment[]`. */
  readonly attachments: readonly PackJson[];
  readonly createdBy: "user" | "agent" | "system";
  readonly creationSource: "web" | "mobile" | "mcp" | "provider" | "server";
  readonly scheduledTaskId?: string;
  readonly senderThreadId?: string;
};

/**
 * Provider-scoped access to the host MCP endpoint (`t3-code` server) for one app thread. Tool
 * calls made with it act as that thread (delegation, thread tools, `ask_user`).
 */
export type PackMcpAccess = { readonly endpoint: string; readonly authorizationHeader: string };

/**
 * Host `ProviderAdapterV2TurnInput`; `appThread` is `OrchestrationV2AppThread`, `providerThread`
 * is `OrchestrationV2ProviderThread`. `mcp` is the MCP access of the turn's own thread (absent when
 * the host has none for it); a session shared by several app threads must use it for this turn's
 * tool calls instead of the access it was opened with.
 */
export type PackTurnInput = {
  readonly appThread: PackJson;
  readonly threadId: string;
  readonly runId: string;
  readonly runOrdinal: number;
  readonly providerTurnOrdinal: number;
  readonly restartContinuationOfRunId?: string;
  readonly attemptId: string;
  readonly rootNodeId: string;
  readonly providerThread: PackJson;
  readonly message: PackTurnMessage;
  readonly modelSelection: PackModelSelection;
  readonly runtimePolicy: PackRuntimePolicy;
  readonly mcp?: PackMcpAccess;
};

/** Host `ProviderAdapterV2ThreadSnapshot`: `OrchestrationV2ProviderThread`, `OrchestrationV2ProviderTurn[]`, `OrchestrationV2ConversationMessage[]`, `OrchestrationV2RuntimeRequest[]`. */
export type PackThreadSnapshot = {
  readonly providerThread: PackJson;
  readonly providerTurns: readonly PackJson[];
  readonly messages: readonly PackJson[];
  readonly runtimeRequests: readonly PackJson[];
  readonly providerPayload?: unknown;
};

/**
 * Wake request for provider-native work that finished outside an active turn
 * (a background job completing, a monitor firing). The host starts a run on
 * the thread that delivers it (host `ProviderContinuationRequests.offer`):
 * - `"message_text"`: `detail` is the whole prompt the next `startTurn` receives;
 * - `"adapter_buffered"`: the pack already buffered the output and the next
 *   `startTurn` (message `creationSource: "provider"`) only triggers ingestion.
 * `notification` (`OrchestrationV2Notification` JSON) labels the timeline row.
 */
export type PackContinuationRequest = {
  readonly threadId: string;
  readonly providerThreadId: string;
  readonly detail: string | null;
  readonly notification?: PackJson;
  readonly delivery?: "adapter_buffered" | "message_text";
};

/** Host services handed to one open session. */
export type PackSessionHost = {
  readonly requestContinuation: (request: PackContinuationRequest) => void;
};

/** Host `ProviderAdapterV2OpenSessionInput` plus the session's MCP access and host services. */
export type PackOpenSessionInput = {
  readonly threadId: string;
  readonly providerSessionId: string;
  readonly modelSelection: PackModelSelection;
  readonly runtimePolicy: PackRuntimePolicy;
  /** `OrchestrationV2ProviderSession` JSON of the session being resumed. */
  readonly resumeFromSession?: PackJson;
  readonly initialNativeThreadId?: string;
  readonly initialProviderItemIdentityVersion?: 2;
  /** MCP access of the thread that opened the session; each turn carries its own thread's. */
  readonly mcp?: PackMcpAccess;
  readonly host: PackSessionHost;
};

/**
 * One open provider session (host `ProviderAdapterV2SessionRuntime`). Optional
 * methods map to "unsupported": steering falls back to the host's
 * interrupt-and-restart policy when the capabilities allow it, rollback and
 * fork fail so the host uses portable context transfer.
 */
export type PackSessionRuntime = {
  /** `OrchestrationV2ProviderSession` JSON; the host stamps `id`, `driver` and `providerInstanceId`. */
  readonly providerSession: PackJson;
  /** Single-consumer stream of `ProviderAdapterV2Event` JSON. Ends when the session closes. */
  events(): AsyncIterable<unknown>;
  hasPendingBackgroundWork?(): Promise<boolean>;
  hasPendingBackgroundWorkForThread?(providerThread: PackJson): Promise<boolean>;
  /** Returns `OrchestrationV2ProviderThread` JSON. */
  ensureThread(input: {
    readonly threadId: string;
    readonly modelSelection: PackModelSelection;
    readonly runtimePolicy: PackRuntimePolicy;
    readonly providerSessionId?: string;
    readonly existingProviderThread?: PackJson;
  }): Promise<PackJson>;
  resumeThread(input: {
    readonly providerThread: PackJson;
    readonly threadId?: string;
    readonly modelSelection?: PackModelSelection;
    readonly runtimePolicy?: PackRuntimePolicy;
  }): Promise<PackJson>;
  /** `messages` are `OrchestrationV2HistoricalMessage` JSON. Resolve `false` when unsupported. */
  injectHistory?(input: {
    readonly messages: readonly PackJson[];
    readonly context: string;
    readonly providerThread: PackJson;
  }): Promise<boolean>;
  startTurn(input: PackTurnInput): Promise<void>;
  compactThread?(input: PackTurnInput): Promise<void>;
  steerTurn?(input: {
    readonly threadId: string;
    readonly runId: string;
    readonly providerThread: PackJson;
    readonly providerTurnId: string;
    readonly message: PackTurnMessage;
    /** MCP access of the steered turn's thread, as on `PackTurnInput`. */
    readonly mcp?: PackMcpAccess;
  }): Promise<void>;
  interruptTurn(input: {
    readonly providerThread: PackJson;
    readonly providerTurnId: string;
    readonly requestRuntimeRestart?: boolean;
  }): Promise<void>;
  unloadThread?(input: { readonly providerThread: PackJson }): Promise<void>;
  respondToRuntimeRequest(input: {
    readonly requestId: string;
    readonly decision?: unknown;
    readonly answers?: unknown;
    readonly response?: unknown;
  }): Promise<void>;
  readThreadSnapshot(input: { readonly providerThread: PackJson }): Promise<PackThreadSnapshot>;
  /** `target` is host `ProviderAdapterV2RollbackTarget` JSON. */
  rollbackThread?(input: {
    readonly providerThread: PackJson;
    readonly target: PackJson;
    readonly providerThreadTurns: readonly PackJson[];
  }): Promise<PackThreadSnapshot>;
  /** Returns the forked `OrchestrationV2ProviderThread` JSON. */
  forkThread?(input: {
    readonly sourceProviderThread: PackJson;
    readonly sourceProviderTurns?: readonly PackJson[];
    readonly providerTurnId?: string;
    readonly targetThreadId: string;
    readonly ownerNodeId?: string;
    readonly modelSelection?: PackModelSelection;
    readonly runtimePolicy?: PackRuntimePolicy;
  }): Promise<PackJson>;
  /** Out-of-band background-job control for one provider thread (see `PackJobControlRequest`). */
  jobControl?(input: {
    readonly providerThread: PackJson;
    readonly request: PackJobControlRequest;
  }): Promise<PackJobControlResult>;
  /** Releases the session's process/resources. Called once when the host closes the session. */
  close(): Promise<void>;
};

/** Host `ProviderSelectionTransitionPlan`. */
export type PackSelectionTransitionPlan =
  | { readonly type: "apply_on_next_turn" }
  | { readonly type: "restart_session" }
  | { readonly type: "create_with_handoff" }
  | { readonly type: "reject"; readonly reason: string };

/** Host `ProviderAdapterV2Shape`. */
export type PackOrchestrationAdapter = {
  /** `OrchestrationV2ProviderCapabilities` JSON. */
  getCapabilities(): Promise<PackJson>;
  /** Absent = every selection change applies on the next turn. */
  planSelectionTransition?(input: {
    readonly current: PackModelSelection;
    readonly target: PackModelSelection;
    readonly sessionCapabilities: PackJson;
  }): Promise<PackSelectionTransitionPlan>;
  openSession(input: PackOpenSessionInput): Promise<PackSessionRuntime>;
};
