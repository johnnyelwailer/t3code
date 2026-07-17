/**
 * Host-side mirror of the pack provider-driver contract.
 *
 * The pack-facing source of truth lives in `@t3work/pack-api`
 * (`src/provider-driver.ts`). Mirroring it here follows the same
 * trust-boundary pattern already used for `PackActivationContext` /
 * `AgentProviderDefinition`: the host holds its own structurally-compatible
 * copy so it never has to import the pack SDK at runtime. Every type is
 * Promise / AsyncIterable based — no Effect types cross this seam.
 *
 * @module t3work-packs.providerDriver
 */

export type PackResumeCursor = unknown;

export type PackProviderModel = {
  readonly slug: string;
  readonly name: string;
  readonly isCustom?: boolean;
};

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

export type PackOpenCodeHarnessOptions = {
  readonly provider: {
    readonly id: string;
    readonly name: string;
    readonly baseURL: string;
    readonly api: "chat-completions" | "responses";
    readonly models: readonly { readonly id: string; readonly name: string }[];
  };
  readonly defaultModel?: string;
  readonly credentialEnv?: string;
};

export type PackHostCapabilities = {
  readonly createOpenCodeHarness: (
    options: PackOpenCodeHarnessOptions,
  ) => Promise<PackProviderInstance>;
};

export type PackDriverCreateInput = {
  readonly instanceId: string;
  readonly displayName: string;
  readonly config: unknown;
  readonly environment: Record<string, string | undefined>;
  readonly host: PackHostCapabilities;
};

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
