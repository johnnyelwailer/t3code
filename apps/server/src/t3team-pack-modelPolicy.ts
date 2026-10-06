import { activateWorkspacePack, type ModelPolicyDefinition } from "@t3team/packs";

import { parseDistributionModelPolicy } from "./t3team-configuredDefaultModelSelection.ts";
import { inertPackActivationContext } from "./t3team-pack-activationContext.ts";
import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";

const CAPABILITY = "model-policy:v1";

/**
 * Collects the one distribution model policy a runtime pack may register (`defineModelPolicy`).
 * The caller installs it with `setDistributionModelPolicy` before the server layers build; an
 * invalid selection rejects here, so a bad pack is a load warning, not a boot defect.
 */
export const loadPackModelPolicy = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<ModelPolicyDefinition | undefined> => {
  let policy: ModelPolicyDefinition | undefined;
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      ...inertPackActivationContext,
      defineModelPolicy: (definition) => {
        if (!pack.manifest.capabilities.includes(CAPABILITY)) {
          throw new Error(`Pack ${pack.manifest.id} defines a model policy without ${CAPABILITY}`);
        }
        if (policy !== undefined) throw new Error("Multiple workspace packs define a model policy");
        policy = definition;
      },
    });
  }
  if (policy !== undefined) parseDistributionModelPolicy(policy);
  return policy;
};
