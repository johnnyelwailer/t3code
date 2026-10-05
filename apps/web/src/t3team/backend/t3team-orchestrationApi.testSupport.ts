import { vi } from "vite-plus/test";

import type { T3TeamOrchestrationApi } from "./t3team-orchestrationApi";

type RecordingOrchestrationApi = {
  readonly [K in keyof T3TeamOrchestrationApi]: ReturnType<typeof vi.fn<T3TeamOrchestrationApi[K]>>;
};

/** An orchestration API whose every write resolves and is recorded, for BackendApi fakes. */
export function createRecordingOrchestrationApi(): RecordingOrchestrationApi {
  return {
    createProject: vi.fn<T3TeamOrchestrationApi["createProject"]>(async () => undefined),
    updateProjectSource: vi.fn<T3TeamOrchestrationApi["updateProjectSource"]>(
      async () => undefined,
    ),
    createThread: vi.fn<T3TeamOrchestrationApi["createThread"]>(async () => undefined),
    startThreadTurn: vi.fn<T3TeamOrchestrationApi["startThreadTurn"]>(async () => undefined),
    updateThreadMetadata: vi.fn<T3TeamOrchestrationApi["updateThreadMetadata"]>(
      async () => undefined,
    ),
  };
}
