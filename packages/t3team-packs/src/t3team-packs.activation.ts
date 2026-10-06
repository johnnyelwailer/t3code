// @effect-diagnostics nodeBuiltinImport:off - activation reads the real on-disk pack layout.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import type { LoadedAiProviderDefinition } from "./t3team-packs.aiProvider.ts";
import type { WorkspacePackManifest } from "./t3team-packs.manifest.ts";
import type { SetupProfileDefinition } from "./t3team-packs.setupProfile.ts";
import type { ThemeDefinition } from "./t3team-packs.theme.ts";

export type WorkflowRepairPolicyDefinition = {
  readonly maxAttempts?: number;
  readonly totalTimeBudgetMs?: number;
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

/**
 * An executable provider driver as the pack loader sees it. The full contract (schemaVersion 2,
 * an orchestration V2 adapter) lives in `@t3team/pack-api`; the host validates `schemaVersion`
 * and narrows the registration to that contract (`apps/server/src/t3team-pack-driverDefinition.ts`).
 */
export type PackProviderDriverRegistration = {
  readonly schemaVersion: number;
  readonly driver: string;
  readonly displayName: string;
};

type PackModelSelectionDefinition = {
  readonly instanceId: string;
  readonly model: string;
  readonly options?: Record<string, unknown>;
};

/** Distribution model defaults; mirrors `@t3team/pack-api` `ModelPolicyDefinition`. */
export type ModelPolicyDefinition = {
  readonly defaultModelSelection?: PackModelSelectionDefinition;
  readonly textGenerationModelSelection?: PackModelSelectionDefinition;
};

/**
 * Delegated-completion wake renderer as the pack loader sees it; the full contract
 * (`CompletionWakeRendererDefinition`, input shape) lives in `@t3team/pack-api`.
 */
export type CompletionWakeRendererRegistration = {
  readonly render: (input: never) => string | Promise<string>;
};

export type WorkflowEphemeralConcurrencyPolicyDefinition = {
  readonly maxActiveSteps: number | "unlimited";
};

/** An account the pack signs the user in to; mirrors `@t3team/pack-api` `AccountDefinition`. */
export type AccountRegistration = {
  readonly id: string;
  readonly label: string;
  readonly issuer: {
    readonly clientId: string;
    readonly authorizationEndpoint: string;
    readonly tokenEndpoint: string;
    readonly deviceAuthorizationEndpoint?: string;
  };
  readonly baseScopes: string;
  readonly resources: Readonly<Record<string, string>>;
  readonly signInResource: string;
};

export type PackActivationContext = {
  readonly pack: { readonly directory: string; readonly manifest: WorkspacePackManifest };
  readonly defineAgentProvider: (definition: LoadedAiProviderDefinition) => void;
  readonly defineProviderDriver: (definition: PackProviderDriverRegistration) => void;
  readonly defineTheme: (definition: ThemeDefinition) => void;
  readonly defineSetupProfile: (definition: SetupProfileDefinition) => void;
  readonly defineWorkflowRepairPolicy: (definition: WorkflowRepairPolicyDefinition) => void;
  readonly defineWorkflowAgentModelPolicy: (definition: WorkflowAgentModelPolicyDefinition) => void;
  readonly defineWorkflowEphemeralConcurrencyPolicy: (
    definition: WorkflowEphemeralConcurrencyPolicyDefinition,
  ) => void;
  readonly defineModelPolicy: (definition: ModelPolicyDefinition) => void;
  readonly defineCompletionWakeRenderer: (definition: CompletionWakeRendererRegistration) => void;
  /** Requires the `account:<id>` capability. */
  readonly defineAccount: (definition: AccountRegistration) => void;
  readonly resolveAssetDataUrl: (relativePath: string, mimeType: string) => Promise<string>;
};
export type PackActivate = (context: PackActivationContext) => void | Promise<void>;

function resolvePackPath(directory: string, path: string): string {
  const root = NodePath.resolve(directory);
  const resolved = NodePath.resolve(root, path);
  if (NodePath.isAbsolute(path) || !resolved.startsWith(`${root}${NodePath.sep}`)) {
    throw new Error(`Pack activation asset escapes its directory: ${path}`);
  }
  return resolved;
}

export async function activateWorkspacePack(
  pack: PackActivationContext["pack"],
  context: Omit<PackActivationContext, "pack">,
): Promise<void> {
  const entrypoint = pack.manifest.entrypoints?.activate;
  if (!entrypoint) return;
  const modulePath = resolvePackPath(pack.directory, entrypoint);
  const loaded = (await import(
    `${NodeURL.pathToFileURL(modulePath).href}?pack=${pack.manifest.id}`
  )) as {
    readonly default?: PackActivate;
    readonly activate?: PackActivate;
  };
  const activate = loaded.default ?? loaded.activate;
  if (typeof activate !== "function") {
    throw new Error(`Pack ${pack.manifest.id} activation entrypoint exports no activate function`);
  }
  await activate({
    ...context,
    pack,
    resolveAssetDataUrl: async (relativePath, mimeType) => {
      const bytes = await NodeFSP.readFile(resolvePackPath(pack.directory, relativePath));
      return `data:${mimeType};base64,${bytes.toString("base64")}`;
    },
  });
}
