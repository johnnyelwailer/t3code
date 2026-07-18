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
 * SPI; see `apps/server/src/t3work-pack-driverBridge.ts`. `resumeCursor`
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
};

export type PackSessionStartInput = {
  readonly threadId: string;
  readonly runtimeMode: string;
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
