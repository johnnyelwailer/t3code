import {
  activateWorkspacePack,
  type WorkflowEphemeralConcurrencyPolicyDefinition,
} from "@t3team/packs";

import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";
import type { WorkflowEphemeralConcurrencyPolicy } from "./t3team-workflowEphemeralConcurrencyPolicy.ts";
import { inertPackActivationContext } from "./t3team-pack-activationContext.ts";

const CAPABILITY = "workflow-ephemeral-concurrency-policy:v1";

export const loadPackWorkflowEphemeralConcurrencyPolicy = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<WorkflowEphemeralConcurrencyPolicy | undefined> => {
  let policy: WorkflowEphemeralConcurrencyPolicyDefinition | undefined;
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      ...inertPackActivationContext,
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
