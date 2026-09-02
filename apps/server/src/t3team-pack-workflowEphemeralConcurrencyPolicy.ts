import {
  activateWorkspacePack,
  type WorkflowEphemeralConcurrencyPolicyDefinition,
} from "@t3team/packs";

import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";

const CAPABILITY = "workflow-ephemeral-concurrency-policy:v1";

/**
 * A pack's ephemeral concurrency policy is a PARTIAL update to the singleton in
 * `t3team-workflowEphemeralConcurrencyPolicy.ts` — a pack that only cares about step concurrency
 * can define `maxActiveSteps` alone and leave `maxLiveRuns` (the run-count cap) untouched, so the
 * return type here stays the pack-facing Definition (both fields independently optional-ish, only
 * `maxActiveSteps` is actually required by the type), not the fully-populated runtime policy.
 */
export const loadPackWorkflowEphemeralConcurrencyPolicy = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<WorkflowEphemeralConcurrencyPolicyDefinition | undefined> => {
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
  if (
    policy.maxLiveRuns !== undefined &&
    policy.maxLiveRuns !== "unlimited" &&
    (!Number.isInteger(policy.maxLiveRuns) || policy.maxLiveRuns < 1)
  ) {
    throw new Error(
      "Ephemeral workflow concurrency maxLiveRuns must be a positive integer or unlimited",
    );
  }
  return policy;
};
