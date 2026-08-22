/**
 * Activates the compiled-in distribution (the `distribution` scope, inlined at build time by
 * `scripts/t3team-distributionPackPlugin.ts`).
 *
 * The distribution's `activate(context)` entry is the same authoring code a runtime pack would
 * export; the only difference is how it arrives. Here it is a normal import (`@t3code/distribution`),
 * so its provider, driver, setup profiles and workflow policies are part of the native bundle rather
 * than a dynamically-imported sidecar. Its `define*` calls are funneled into the exact singletons the
 * runtime pack loader uses, so a distribution and a post-install pack are indistinguishable to the
 * rest of the server. Assets and the theme are inlined data, resolved against the inlined asset map
 * instead of a pack directory.
 *
 * This is the baseline layer: it runs before any post-install pack, and a runtime pack that provides
 * a given content type overrides it (see `cli/t3team-server.ts`).
 */
import type { ModelSelection } from "@t3tools/contracts";
import {
  type AgentProviderDefinition,
  type PackActivationContext,
  type PackProviderDriverDefinition as PackApiProviderDriverDefinition,
  type PackSetupProfileDefinition,
  type WorkflowAgentModelPolicyDefinition,
  type WorkflowEphemeralConcurrencyPolicyDefinition,
  type WorkflowRepairPolicyDefinition,
} from "@t3team/pack-api";
import {
  decodeSetupProfileDefinition,
  decodeThemeDefinition,
  type LoadedAiProviderDefinition,
  type PackProviderDriverDefinition,
} from "@t3team/packs";

import {
  activateDistribution,
  distributionAssets,
  distributionTheme,
  type DistributionTheme,
} from "@t3code/distribution";

import { packAiProvidersToInstanceConfigMap } from "./t3team-pack-aiProvider.ts";
import { setPackAppearanceOverlay } from "./t3team-pack-appearanceOverlay.ts";
import { setPackProviderOverlay } from "./t3team-pack-providerOverlay.ts";
import { setPackSetupProfileOverlay } from "./t3team-pack-setupProfileOverlay.ts";
import { setWorkflowAgentModelPolicy } from "./t3team-workflowAgentModelPolicy.ts";
import {
  DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS,
  setWorkflowEphemeralConcurrencyPolicy,
} from "./t3team-workflowEphemeralConcurrencyPolicy.ts";
import { setWorkflowRepairPolicy } from "./t3team-workflowRepairPolicy.ts";

/**
 * Pack model selections are structurally the contracts `ModelSelection`; the runtime pack loaders
 * use the same cast (see `t3team-pack-workflowRepairPolicy.ts`).
 */
type PackModelSelection = {
  readonly instanceId: string;
  readonly model: string;
  readonly options?: Record<string, unknown>;
};

const toModelSelection = (selection: PackModelSelection): ModelSelection =>
  selection as unknown as ModelSelection;

/** Resolve a theme's brand asset paths against the inlined asset map (pack-root-relative keys). */
const resolveThemeBrand = (
  theme: DistributionTheme,
  assets: Readonly<Record<string, string>>,
): DistributionTheme => {
  const brand = theme.brand as Readonly<Record<string, string | undefined>> | undefined;
  if (!brand) return theme;
  const resolved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(brand)) {
    resolved[key] =
      value === undefined
        ? undefined
        : value.startsWith("data:")
          ? value
          : (assets[value] ?? value);
  }
  return { ...theme, brand: resolved };
};

export const activateCompiledInDistribution = async (): Promise<void> => {
  if (!activateDistribution) return;

  const providers: AgentProviderDefinition[] = [];
  const drivers: PackApiProviderDriverDefinition[] = [];
  const profiles: PackSetupProfileDefinition[] = [];
  let repairPolicy: WorkflowRepairPolicyDefinition | undefined;
  let agentModelPolicy: WorkflowAgentModelPolicyDefinition | undefined;
  let ephemeralPolicy: WorkflowEphemeralConcurrencyPolicyDefinition | undefined;

  const context: PackActivationContext = {
    pack: { id: "distribution", directory: "" },
    defineAgentProvider: (definition) => {
      providers.push(definition);
    },
    defineProviderDriver: (definition) => {
      drivers.push(definition);
    },
    // The distribution ships its theme as a JSON file (inlined as `distributionTheme`), not via an
    // executable `defineTheme`. Failing loudly keeps a distribution that calls it from shipping
    // silently without a theme.
    defineTheme: () => {
      throw new Error(
        "Compiled-in distributions ship their theme via distribution.json; defineTheme is not supported",
      );
    },
    defineSetupProfile: (definition) => {
      profiles.push(definition);
    },
    defineWorkflowRepairPolicy: (definition) => {
      repairPolicy = definition;
    },
    defineWorkflowAgentModelPolicy: (definition) => {
      agentModelPolicy = definition;
    },
    defineWorkflowEphemeralConcurrencyPolicy: (definition) => {
      ephemeralPolicy = definition;
    },
    resolveAssetDataUrl: async (relativePath) => {
      const inlined = distributionAssets[relativePath];
      if (inlined) return inlined;
      throw new Error(`Compiled-in distribution asset not found: ${relativePath}`);
    },
  };

  await activateDistribution(context);

  // The same checks the runtime pack loaders perform (t3team-pack-workflow*Policy.ts), so a
  // malformed compiled-in distribution fails at activation, not later at workflow launch.
  const selection = repairPolicy?.modelSelection;
  if (selection !== undefined && selection !== "inherit") {
    if (!selection.instanceId.trim() || !selection.model.trim()) {
      throw new Error("Workflow repair policy model selection needs an instanceId and model");
    }
  }
  const agentSelection = agentModelPolicy?.modelSelection;
  if (
    agentSelection !== undefined &&
    agentSelection !== "inherit" &&
    (!agentSelection.instanceId.trim() || !agentSelection.model.trim())
  ) {
    throw new Error("Workflow agent model policy needs an instanceId and model");
  }
  if (
    ephemeralPolicy !== undefined &&
    ephemeralPolicy.maxActiveSteps !== "unlimited" &&
    (!Number.isInteger(ephemeralPolicy.maxActiveSteps) || ephemeralPolicy.maxActiveSteps < 1)
  ) {
    throw new Error(
      "Ephemeral workflow concurrency maxActiveSteps must be a positive integer or unlimited",
    );
  }

  if (providers.length > 0 || drivers.length > 0) {
    setPackProviderOverlay({
      configMap: packAiProvidersToInstanceConfigMap(
        providers as unknown as ReadonlyArray<LoadedAiProviderDefinition>,
      ),
      driverDefinitions: new Map(
        drivers.map((definition) => [
          definition.driver,
          definition as unknown as PackProviderDriverDefinition,
        ]),
      ),
    });
  }
  if (profiles.length > 0) {
    setPackSetupProfileOverlay(profiles.map((profile) => decodeSetupProfileDefinition(profile)));
  }
  if (repairPolicy) {
    const { modelSelection, ...rest } = repairPolicy;
    setWorkflowRepairPolicy({
      ...rest,
      ...(modelSelection === undefined
        ? {}
        : {
            modelSelection:
              modelSelection === "inherit" ? "inherit" : toModelSelection(modelSelection),
          }),
    });
  }
  if (agentModelPolicy) {
    const { modelSelection } = agentModelPolicy;
    setWorkflowAgentModelPolicy(
      modelSelection === "inherit" ? "inherit" : toModelSelection(modelSelection),
    );
  }
  if (ephemeralPolicy) setWorkflowEphemeralConcurrencyPolicy(ephemeralPolicy);
  if (distributionTheme) {
    const theme = decodeThemeDefinition(resolveThemeBrand(distributionTheme, distributionAssets));
    setPackAppearanceOverlay({ ...theme, themeId: theme.id });
  }
};
