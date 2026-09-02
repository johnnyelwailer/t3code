import type { PackProviderDriverDefinition } from "./provider-driver.ts";

export * from "./provider-driver.ts";

export type PackAssetResolver = (relativePath: string, mimeType: string) => Promise<string>;

export type WorkflowRepairPolicyDefinition = {
  readonly totalTimeBudgetMs?: number;
  readonly maxAttempts?: number;
  readonly modelSelection?:
    | "inherit"
    | {
        readonly instanceId: string;
        readonly model: string;
        readonly options?: Record<string, unknown>;
      };
};

export type WorkflowAgentModelPolicyDefinition = {
  readonly modelSelection:
    | "inherit"
    | {
        readonly instanceId: string;
        readonly model: string;
        readonly options?: Record<string, unknown>;
      };
};

export type WorkflowEphemeralConcurrencyPolicyDefinition = {
  readonly maxActiveSteps: number | "unlimited";
  /** Max ephemeral runs (agent-authored via `t3team.orchestration.run`) holding engine resources
   * — running/suspended/sleeping/paused — per launching thread, at once. Optional: a pack that
   * only cares about step concurrency can omit it and leave the run-count cap untouched. */
  readonly maxLiveRuns?: number | "unlimited";
};

export type AgentProviderModel = {
  readonly id: string;
  readonly name: string;
};

export type AgentProviderDefinition = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly driver: string;
  readonly harness: "opencode";
  readonly displayName: string;
  readonly accent?: `#${string}`;
  readonly icon?: string;
  readonly iconDataUrl?: string;
  readonly credentialEnv?: string;
  readonly modelDiscovery?: "configured" | "dynamic";
  readonly modelSelection?: "user" | "fixed";
  readonly defaultModel?: string;
  readonly configuration: {
    readonly kind: "upstream-provider";
    readonly provider: {
      readonly id: string;
      readonly name: string;
      readonly baseURL: string;
      readonly api: "chat-completions" | "responses";
      readonly models: readonly AgentProviderModel[];
    };
  };
};

export type PackThemeDefinition = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly productName?: string;
  readonly publisher?: string;
  readonly labels?: { readonly appName?: string };
  readonly defaultMode?: "dark" | "light" | "system";
  /**
   * Brand imagery as data URLs. Executable packs resolve pack-local files via
   * `resolveAssetDataUrl` before registering the theme; JSON themes may use
   * pack-relative paths instead (the manifest loader resolves them).
   */
  readonly brand?: {
    readonly mark?: string;
    readonly markDark?: string;
    readonly wordmark?: string;
    readonly wordmarkDark?: string;
    /** Heading-only font (ttf/otf/woff2); body text keeps the sans stack. */
    readonly displayFont?: string;
  };
  readonly colors: {
    readonly light: Record<string, string>;
    readonly dark: Record<string, string>;
  };
  readonly typography?: Record<string, string | number>;
  readonly shape?: Record<string, string | number>;
  readonly density?: number;
};

export type PackSetupProfileCategory =
  | "product"
  | "delivery"
  | "engineering"
  | "operations"
  | "security";

export type PackSetupProfileAudience =
  | "mixed"
  | "qa"
  | "product"
  | "support"
  | "delivery"
  | "engineering";

/**
 * A project-setup profile ("role") the pack contributes to the first-run wizard.
 * Carries both presentation (card visuals) and behavior (communication style,
 * recipe weights) so a distribution fully owns its role catalog. `iconDataUrl`
 * is resolved by the pack via `resolveAssetDataUrl` (same convention as provider
 * icons and theme brand assets).
 */
export type PackSetupProfileDefinition = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly badge: string;
  readonly bullets: readonly string[];
  readonly category: PackSetupProfileCategory;
  readonly iconDataUrl?: string;
  readonly audience: PackSetupProfileAudience;
  readonly communicationStyle: {
    readonly technicalDepth: "low" | "medium" | "high";
    readonly brevity: "short" | "balanced" | "detailed";
    readonly guidanceStyle: "guided" | "balanced" | "expert";
    readonly defaultLanguage?: string;
  };
  readonly preferredArtifactKinds: readonly string[];
  readonly recipeWeights: Readonly<Record<string, number>>;
  readonly recommendedSkillPackIds: readonly string[];
  readonly hideImplementationComplexity: boolean;
  readonly tags?: readonly string[];
  readonly defaultActionFamilies?: readonly string[];
  /** Marks this as the pre-selected profile when the pack's catalog is active. */
  readonly default?: boolean;
};

export type PackActivationContext = {
  readonly pack: { readonly id: string; readonly directory: string };
  readonly defineAgentProvider: (definition: AgentProviderDefinition) => void;
  readonly defineProviderDriver: (definition: PackProviderDriverDefinition) => void;
  readonly defineTheme: (definition: PackThemeDefinition) => void;
  readonly defineSetupProfile: (definition: PackSetupProfileDefinition) => void;
  readonly defineWorkflowRepairPolicy: (definition: WorkflowRepairPolicyDefinition) => void;
  readonly defineWorkflowAgentModelPolicy: (definition: WorkflowAgentModelPolicyDefinition) => void;
  readonly defineWorkflowEphemeralConcurrencyPolicy: (
    definition: WorkflowEphemeralConcurrencyPolicyDefinition,
  ) => void;
  readonly resolveAssetDataUrl: PackAssetResolver;
};

export type PackActivate = (context: PackActivationContext) => void | Promise<void>;

const identifier = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

const assertIdentifier = (value: string, field: string): void => {
  if (!identifier.test(value)) throw new Error(`${field} must be a lowercase pack identifier`);
};

export const defineAgentProvider = <const T extends AgentProviderDefinition>(definition: T): T => {
  assertIdentifier(definition.id, "Provider id");
  assertIdentifier(definition.driver, "Provider driver");
  if (definition.configuration.provider.models.length === 0) {
    throw new Error(`Provider ${definition.id} must define at least one model`);
  }
  return definition;
};

export const defineTheme = <const T extends PackThemeDefinition>(definition: T): T => {
  assertIdentifier(definition.id, "Theme id");
  return definition;
};

export const defineSetupProfile = <const T extends PackSetupProfileDefinition>(
  definition: T,
): T => {
  assertIdentifier(definition.id, "Setup profile id");
  if (definition.bullets.length === 0) {
    throw new Error(`Setup profile ${definition.id} must define at least one bullet`);
  }
  return definition;
};
