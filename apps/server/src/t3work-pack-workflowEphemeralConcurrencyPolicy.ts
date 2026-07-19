import {
  activateWorkspacePack,
  type WorkflowEphemeralConcurrencyPolicyDefinition,
} from "@t3work/packs";

import type { WorkspacePackHostDiagnostic } from "./t3work-pack-host.ts";
import type { WorkflowEphemeralConcurrencyPolicy } from "./t3work-workflowEphemeralConcurrencyPolicy.ts";

const CAPABILITY = "workflow-ephemeral-concurrency-policy:v1";

export const loadPackWorkflowEphemeralConcurrencyPolicy = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<WorkflowEphemeralConcurrencyPolicy | undefined> => {
  let policy: WorkflowEphemeralConcurrencyPolicyDefinition | undefined;
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      defineAgentProvider: () => undefined,
      defineProviderDriver: () => undefined,
      defineTheme: () => undefined,
      defineSetupProfile: () => undefined,
      defineWorkflowRepairPolicy: () => undefined,
      defineWorkflowAgentModelPolicy: () => undefined,
      defineWorkflowEphemeralConcurrencyPolicy: (definition) => {
        if (!pack.manifest.capabilities.includes(CAPABILITY)) {
          throw new Error(
            `Pack ${pack.manifest.id} defines an ephemeral workflow concurrency policy without ${CAPABILITY}`,
          );
        }
        if (policy !== undefined) {
          throw new Error(
            "Multiple workspace packs define an ephemeral workflow concurrency policy",
          );
        }
        policy = definition;
      },
      resolveAssetDataUrl: async () => {
        throw new Error("Asset resolution is only available to pack activation code");
      },
    });
  }
  if (policy === undefined) return undefined;
  if (
    policy.maxActiveSteps !== "unlimited" &&
    (!Number.isInteger(policy.maxActiveSteps) || policy.maxActiveSteps < 1)
  ) {
    throw new Error(
      "Ephemeral workflow concurrency maxActiveSteps must be a positive integer or unlimited",
    );
  }
  return policy;
};
