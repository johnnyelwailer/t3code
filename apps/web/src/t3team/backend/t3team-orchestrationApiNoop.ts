import type { T3TeamOrchestrationApi } from "./t3team-orchestrationApi";

const resolveNothing = async (): Promise<void> => undefined;

/** An orchestration API that accepts every write and does nothing, for stories and fixtures. */
export const noopT3TeamOrchestrationApi: T3TeamOrchestrationApi = {
  createProject: resolveNothing,
  updateProjectSource: resolveNothing,
  createThread: resolveNothing,
  startThreadTurn: resolveNothing,
  updateThreadMetadata: resolveNothing,
};
