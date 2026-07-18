import type { PackProviderDriverDefinition } from "./provider-driver.ts";

export * from "./provider-driver.ts";

export type PackAssetResolver = (relativePath: string, mimeType: string) => Promise<string>;

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
  };
  readonly colors: {
    readonly light: Record<string, string>;
    readonly dark: Record<string, string>;
  };
  readonly typography?: Record<string, string | number>;
  readonly shape?: Record<string, string | number>;
  readonly density?: number;
};

export type PackActivationContext = {
  readonly pack: { readonly id: string; readonly directory: string };
  readonly defineAgentProvider: (definition: AgentProviderDefinition) => void;
  readonly defineProviderDriver: (definition: PackProviderDriverDefinition) => void;
  readonly defineTheme: (definition: PackThemeDefinition) => void;
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
