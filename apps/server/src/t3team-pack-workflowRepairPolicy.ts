import { activateWorkspacePack, type WorkflowRepairPolicyDefinition } from "@t3team/packs";
import type { ModelSelection } from "@t3tools/contracts";

import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";
import type { WorkflowRepairPolicy } from "./t3team-workflowRepairPolicy.ts";

const WORKFLOW_REPAIR_POLICY_CAPABILITY = "workflow-repair-policy:v1";

/** Loads one generic policy definition. Product/model details stay in the pack. */
export const loadPackWorkflowRepairPolicy = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<Partial<WorkflowRepairPolicy> | undefined> => {
  let policy: WorkflowRepairPolicyDefinition | undefined;
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      defineAgentProvider: () => undefined,
      defineProviderDriver: () => undefined,
      defineTheme: () => undefined,
      defineSetupProfile: () => undefined,
      defineWorkflowRepairPolicy: (definition) => {
        if (!pack.manifest.capabilities.includes(WORKFLOW_REPAIR_POLICY_CAPABILITY)) {
          throw new Error(
            `Pack ${pack.manifest.id} defines a workflow repair policy without ${WORKFLOW_REPAIR_POLICY_CAPABILITY}`,
          );
        }
        if (policy !== undefined) {
          throw new Error("Multiple workspace packs define a workflow repair policy");
        }
        policy = definition;
      },
      defineWorkflowAgentModelPolicy: () => undefined,
      defineWorkflowEphemeralConcurrencyPolicy: () => undefined,
      resolveAssetDataUrl: async () => {
        throw new Error("Asset resolution is only available to pack activation code");
      },
    });
  }
  if (policy === undefined) return undefined;
  const modelSelection = policy.modelSelection;
  if (
    modelSelection !== undefined &&
    modelSelection !== "inherit" &&
    (!modelSelection.instanceId.trim() || !modelSelection.model.trim())
  ) {
    throw new Error("Workflow repair policy model selection needs an instanceId and model");
  }
  return {
    ...(policy.maxAttempts === undefined ? {} : { maxAttempts: policy.maxAttempts }),
    ...(policy.totalTimeBudgetMs === undefined
      ? {}
      : { totalTimeBudgetMs: policy.totalTimeBudgetMs }),
    ...(modelSelection === undefined
      ? {}
      : {
          modelSelection:
            modelSelection === "inherit"
              ? "inherit"
              : (modelSelection as unknown as ModelSelection),
        }),
  };
};
