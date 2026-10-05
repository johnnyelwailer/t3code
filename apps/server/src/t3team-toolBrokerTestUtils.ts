import { ThreadId } from "@t3tools/contracts";

export {
  makeBrokerLayer,
  makeBrokerLayerWithLiveContextRefresh,
  type TestDispatch,
} from "./t3team-toolBrokerTestLayers.ts";

export const threadId = ThreadId.make("thread-1");

type TestToolContextTool = {
  id: string;
  label: string;
  capabilities: ReadonlyArray<"read" | "write">;
};

export function createThreadToolContext(input: {
  readonly tools: ReadonlyArray<TestToolContextTool>;
  readonly view?: Partial<{
    kind: "thread";
    projectId: string;
    projectTitle: string;
    workspaceRoot: string;
    threadId: ThreadId;
    threadTitle: string;
    ticketId: string;
    ticketDisplayId?: string;
    displayMode: "thread" | "embedded";
  }>;
}) {
  return {
    surface: "t3team" as const,
    tools: [...input.tools],
    state: {
      view: {
        kind: "thread" as const,
        projectId: "project-1",
        projectTitle: "Project One",
        workspaceRoot: "/workspace/project-1",
        threadId,
        threadTitle: "Original title",
        ...input.view,
      },
    },
  };
}
