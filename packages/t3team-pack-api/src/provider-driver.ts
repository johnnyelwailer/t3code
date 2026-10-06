/**
 * Pack-owned provider driver contract (schemaVersion 2).
 *
 * A pack may ship an *executable* provider driver — code that owns config,
 * auth, model policy and the live session lifecycle — instead of the
 * data-only `AgentProviderDefinition` (which is fixed to the host's
 * OpenCode harness). The driver's live surface is an orchestration V2
 * provider adapter (`./provider-orchestration.ts`), defined entirely in terms
 * of Promise / AsyncIterable and canonical JSON so the SDK never leaks host
 * Effect types.
 *
 * The host maps every method one-to-one onto its Effect-based
 * `ProviderInstance.orchestrationAdapter`; see
 * `apps/server/src/t3team-pack-driverBridge.ts`.
 *
 * @module provider-driver
 */
import type { PackOrchestrationAdapter } from "./provider-orchestration.ts";

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
 * wrap `orchestration.openSession` / a session's `startTurn` for retry, wrap a
 * session's `events()` for normalization — while owning config/auth/model
 * policy itself. Its entities already carry the pack's own driver kind.
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
  /**
   * The user's global "Personality / Instructions" override from the host
   * server settings (host `ServerSettings.agentInstructions`). Absent or
   * empty = use the driver's built-in default personality. Hosts predating
   * this field omit it; packs MUST treat absence as "unset". Applies to
   * agent sessions only — host text-generation calls keep their own
   * prompts.
   */
  readonly agentInstructions?: string | undefined;
};

/**
 * One thread's background-job control, reaching the runtime's live job
 * registry OUT OF BAND: the transcript only names a job when the runtime's
 * own tools/notices surface it, so the host (and its UI) also reads state
 * straight from the registry.
 *
 * `read-output` is cursor-paged in BYTES over a bounded ring: `since` is a
 * byte offset into the retained stream, `maxBytes` caps the page, and the
 * runtime resolves torn UTF-8 boundaries (never the host).
 */
export type PackJobControlRequest =
  | { readonly kind: "list" }
  | { readonly kind: "cancel"; readonly jobId: string }
  | {
      readonly kind: "read-output";
      readonly jobId: string;
      readonly since?: number;
      readonly maxBytes?: number;
    };

export type PackJobControlResult =
  | {
      readonly kind: "jobs";
      readonly jobs: readonly {
        readonly jobId: string;
        readonly command: string;
        readonly pid?: number;
        readonly state: "running" | "completed" | "failed" | "killed-deadline" | "cancelled";
        readonly exitCode: number | null;
        readonly startedAtMs: number;
      }[];
    }
  | {
      readonly kind: "cancelled";
      readonly jobId: string;
      readonly state: "running" | "completed" | "failed" | "killed-deadline" | "cancelled";
      readonly exitCode: number | null;
      readonly elapsedMs: number;
      readonly command: string;
    }
  | {
      readonly kind: "output";
      readonly jobId: string;
      readonly text: string;
      readonly nextCursor: number;
      readonly oldestRetained: number;
      readonly settled: boolean;
    }
  | { readonly kind: "unknown-job"; readonly jobId: string };

/**
 * One live provider instance owned by the pack: its snapshot, its V2
 * orchestration adapter and optional text generation.
 */
export type PackProviderInstance = {
  snapshot(): PackProviderSnapshot;
  subscribeSnapshot?(listener: (snapshot: PackProviderSnapshot) => void): () => void;
  readonly orchestration: PackOrchestrationAdapter;
  readonly textGeneration?: PackTextGeneration;
  dispose(): Promise<void>;
};

export type PackProviderDriverDefinition = {
  readonly schemaVersion: 2;
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
  if (definition.schemaVersion !== 2) {
    throw new Error(
      `Provider driver ${definition.driver} must use schemaVersion 2 (orchestration V2 adapter)`,
    );
  }
  if (typeof definition.create !== "function") {
    throw new Error(`Provider driver ${definition.driver} must define a create function`);
  }
  return definition;
};
