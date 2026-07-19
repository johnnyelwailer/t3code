import { activateWorkspacePack, type WorkflowAgentModelPolicyDefinition } from "@t3work/packs";
import type { ModelSelection } from "@t3tools/contracts";

import type { WorkspacePackHostDiagnostic } from "./t3work-pack-host.ts";
import type { WorkflowAgentModelPolicy } from "./t3work-workflowAgentModelPolicy.ts";

const CAPABILITY = "workflow-agent-model-policy:v1";

export const loadPackWorkflowAgentModelPolicy = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<WorkflowAgentModelPolicy | undefined> => {
  let policy: WorkflowAgentModelPolicyDefinition | undefined;
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      defineAgentProvider: () => undefined,
      defineProviderDriver: () => undefined,
      defineTheme: () => undefined,
      defineSetupProfile: () => undefined,
      defineWorkflowRepairPolicy: () => undefined,
      defineWorkflowAgentModelPolicy: (definition) => {
        if (!pack.manifest.capabilities.includes(CAPABILITY)) {
          throw new Error(
            `Pack ${pack.manifest.id} defines a workflow agent model policy without ${CAPABILITY}`,
          );
        }
        if (policy !== undefined)
          throw new Error("Multiple workspace packs define a workflow agent model policy");
        policy = definition;
      },
      defineWorkflowEphemeralConcurrencyPolicy: () => undefined,
      resolveAssetDataUrl: async () => {
        throw new Error("Asset resolution is only available to pack activation code");
      },
    });
  }
  if (policy === undefined) return undefined;
  const selection = policy.modelSelection;
  if (selection === "inherit") return selection;
  if (!selection.instanceId.trim() || !selection.model.trim()) {
    throw new Error("Workflow agent model policy needs an instanceId and model");
  }
  return selection as unknown as ModelSelection;
};
