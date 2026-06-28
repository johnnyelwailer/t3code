import { ThreadId } from "@t3tools/contracts";

export {
  makeBrokerLayer,
  makeBrokerLayerWithLiveContextRefresh,
  makeBrokerLayerWithOptions,
} from "./t3work-toolBrokerTestLayers.ts";

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
    surface: "t3work" as const,
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

export function joinPosix(...segments: ReadonlyArray<string>): string {
  const normalized = segments
    .filter((segment) => segment.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function dirnamePosix(value: string): string {
  const normalized = value.replace(/\/+/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  return lastSlashIndex <= 0 ? "/" : normalized.slice(0, lastSlashIndex);
}
