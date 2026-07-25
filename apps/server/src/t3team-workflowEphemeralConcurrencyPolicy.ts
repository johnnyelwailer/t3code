/** Conservative core default; distributions may override this through pack activation. */
export const DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS = 8;

export type WorkflowEphemeralConcurrencyPolicy = {
  readonly maxActiveSteps: number | "unlimited";
};

let policy: WorkflowEphemeralConcurrencyPolicy = {
  maxActiveSteps: DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS,
};

export const setWorkflowEphemeralConcurrencyPolicy = (
  next: WorkflowEphemeralConcurrencyPolicy,
): void => {
  policy = next;
};

export const getWorkflowEphemeralConcurrencyPolicy = (): WorkflowEphemeralConcurrencyPolicy =>
  policy;
