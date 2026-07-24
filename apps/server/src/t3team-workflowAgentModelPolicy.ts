import type { ModelSelection } from "@t3tools/contracts";

export type WorkflowAgentModelPolicy = "inherit" | ModelSelection;

let policy: WorkflowAgentModelPolicy = "inherit";

export const setWorkflowAgentModelPolicy = (next: WorkflowAgentModelPolicy): void => {
  policy = next;
};

export const getWorkflowAgentModelPolicy = (): WorkflowAgentModelPolicy => policy;

export const resolveWorkflowAgentModel = (launchModel: ModelSelection): ModelSelection =>
  policy === "inherit" ? launchModel : policy;
