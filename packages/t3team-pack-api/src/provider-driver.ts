/**
 * Pack-owned provider driver contract.
 *
 * A pack may ship an *executable* provider driver — code that owns config,
 * auth, model policy and the live session lifecycle — instead of the
 * data-only `AgentProviderDefinition` (which is fixed to the host's
 * OpenCode harness). This module defines that contract entirely in terms of
 * Promise / AsyncIterable so the SDK never leaks host Effect types.
 *
 * The host bridges every method back into its Effect-based `ProviderDriver`
 * SPI; see `apps/server/src/t3team-pack-driverBridge.ts`. `resumeCursor`
 * stays opaque (`unknown`) end to end so reconnect keeps working without the
 * pack having to model the host's persistence.
 *
 * @module provider-driver
 */

/** Opaque, provider-defined resume token. Persisted and replayed verbatim. */
export type PackResumeCursor = unknown;

export type PackProviderModel = {
  readonly slug: string;
  readonly name: string;
  readonly isCustom?: boolean;
};

/**
 * Provider snapshot as plain data. The host decodes this into its wire
 * `ServerProvider`, re-stamping the driver id and instance id, and falls
 * back to an "unavailable" shadow snapshot if it cannot be decoded.
 */
export type PackProviderSnapshot = {
  readonly displayName: string;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly version?: string | null;
  readonly status: "ready" | "warning" | "error" | "disabled";
  readonly authenticated?: boolean;
  readonly message?: string;
  readonly models: readonly PackProviderModel[];
  /**
   * Whether the composer shows the Chat/Plan interaction-mode toggle. Defaults to
   * `true` (host behavior). A driver that ignores `interactionMode` should set
   * `false` so the composer does not offer a control that changes nothing —
   * the built-in Grok provider does the same.
   */
  readonly showInteractionModeToggle?: boolean;
};

export type PackSessionStartInput = {
  readonly threadId: string;
  readonly runtimeMode: string;
  /** Provider-scoped access to the host MCP endpoint for this thread. */
  readonly mcp?: {
    readonly endpoint: string;
    readonly authorizationHeader: string;
  };
  readonly cwd?: string;
  readonly resumeCursor?: PackResumeCursor;
  /** Opaque host `ModelSelection`; forward verbatim. */
  readonly modelSelection?: unknown;
  /** Opaque host `ProviderApprovalPolicy`; forward verbatim. */
  readonly approvalPolicy?: unknown;
  /** Opaque host `ProviderSandboxMode`; forward verbatim. */
  readonly sandboxMode?: unknown;
};

export type PackProviderSession = {
  readonly threadId: string;
  readonly status: string;
  readonly runtimeMode: string;
  readonly cwd?: string;
  readonly model?: string;
  readonly resumeCursor?: PackResumeCursor;
  readonly [key: string]: unknown;
};

export type PackSendTurnInput = {
  readonly threadId: string;
  readonly input?: string;
  /** Opaque host `ChatAttachment[]`; forward verbatim. */
  readonly attachments?: readonly unknown[];
  /** Opaque host `ModelSelection`; forward verbatim. */
  readonly modelSelection?: unknown;
  /** Opaque host `ProviderInteractionMode`; forward verbatim. */
  readonly interactionMode?: unknown;
  /** "user" for a typed message, "automated" for fork automation; absent = treat as "user". */
  readonly turnOrigin?: "user" | "automated";
};

export type PackTurnStartResult = {
  readonly threadId: string;
  readonly turnId: string;
  readonly resumeCursor?: PackResumeCursor;
};

export type PackThreadSnapshot = {
  readonly threadId: string;
  readonly turns: readonly unknown[];
};

export type PackTextGeneration = {
  generateCommitMessage(input: {
    readonly cwd: string;
    readonly branch: string | null;
    readonly stagedSummary: string;
    readonly stagedPatch: string;
    readonly includeBranch?: boolean;
    readonly modelSelection: unknown;
  }): Promise<{ readonly subject: string; readonly body: string; readonly branch?: string }>;
  generatePrContent(input: {
    readonly cwd: string;
    readonly baseBranch: string;
    readonly headBranch: string;
    readonly commitSummary: string;
    readonly diffSummary: string;
    readonly diffPatch: string;
    readonly modelSelection: unknown;
  }): Promise<{ readonly title: string; readonly body: string }>;
  generateBranchName(input: {
    readonly cwd: string;
    readonly message: string;
    readonly attachments?: readonly unknown[] | undefined;
    readonly modelSelection: unknown;
  }): Promise<{ readonly branch: string }>;
  generateThreadTitle(input: {
    readonly cwd: string;
    readonly message: string;
    readonly attachments?: readonly unknown[] | undefined;
    readonly modelSelection: unknown;
  }): Promise<{ readonly title: string }>;
  /**
   * Short "what is this thread working on NOW" label (GHE #40). The host hard-caps
   * `context` (~400 chars: the last few activities + a one-line user-intent gist) and
   * the response must be a 2-4 word phrase. Packs without this method leave the
   * thread on the static "Working" pill (fail-open).
   */
  generateActivityLabel?(input: {
    readonly cwd: string;
    readonly context: string;
    readonly modelSelection: unknown;
  }): Promise<{ readonly label: string }>;
  /** Out-of-band structured generation. The host validates the returned value against its
   * requested schema; this call never creates or appends to a provider thread. */
  generateStructured?(input: {
    readonly cwd: string;
    readonly prompt: string;
    readonly modelSelection: unknown;
  }): Promise<unknown>;
};

/**
 * Host capabilities handed to a pack driver's `create`. `createOpenCodeHarness`
 * lets a pack compose the reviewed host OpenCode harness and decorate it —
 * wrap `startSession` for retry, wrap `events()` for normalization — while
 * owning config/auth/model policy itself.
 */
export type PackHostCapabilities = {
  readonly createOpenCodeHarness: (options: {
    readonly provider: {
      readonly id: string;
      readonly name: string;
      readonly baseURL: string;
      readonly api: "chat-completions" | "responses";
      readonly models: readonly { readonly id: string; readonly name: string }[];
    };
    readonly defaultModel?: string;
    readonly credentialEnv?: string;
  }) => Promise<PackProviderInstance>;
};

export type PackDriverCreateInput = {
  readonly instanceId: string;
  readonly displayName: string;
  readonly config: unknown;
  readonly environment: Record<string, string | undefined>;
  readonly host: PackHostCapabilities;
};

/**
 * One live provider instance owned by the pack. Method semantics mirror the
 * host `ProviderAdapter` surface one-to-one so the bridge is mechanical.
 * Every emitted event object SHOULD be `ProviderRuntimeEvent`-shaped; the
 * host defensively re-stamps `provider`/`providerInstanceId` and drops
 * events that fail to decode.
 */
export type PackProviderInstance = {
  snapshot(): PackProviderSnapshot;
  subscribeSnapshot?(listener: (snapshot: PackProviderSnapshot) => void): () => void;
  startSession(input: PackSessionStartInput): Promise<PackProviderSession>;
  sendTurn(input: PackSendTurnInput): Promise<PackTurnStartResult>;
  interruptTurn(threadId: string, turnId?: string): Promise<void>;
  respondToRequest(threadId: string, requestId: string, decision: unknown): Promise<void>;
  respondToUserInput(threadId: string, requestId: string, answers: unknown): Promise<void>;
  stopSession(threadId: string): Promise<void>;
  hasSession(threadId: string): Promise<boolean>;
  listSessions(): Promise<readonly PackProviderSession[]>;
  readThread(threadId: string): Promise<PackThreadSnapshot>;
  rollbackThread(threadId: string, numTurns: number): Promise<PackThreadSnapshot>;
  readonly textGeneration?: PackTextGeneration;
  stopAll(): Promise<void>;
  events(): AsyncIterable<unknown>;
  dispose(): Promise<void>;
};

export type PackProviderDriverDefinition = {
  readonly schemaVersion: 1;
  readonly driver: string;
  readonly displayName: string;
  readonly supportsMultipleInstances?: boolean;
  create(input: PackDriverCreateInput): Promise<PackProviderInstance>;
};

const identifier = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export const defineProviderDriver = <const T extends PackProviderDriverDefinition>(
  definition: T,
): T => {
  if (!identifier.test(definition.driver)) {
    throw new Error("Provider driver must be a lowercase pack identifier");
  }
  if (typeof definition.create !== "function") {
    throw new Error(`Provider driver ${definition.driver} must define a create function`);
  }
  return definition;
};
