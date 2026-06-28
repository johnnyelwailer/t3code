import { ThreadId } from "@t3tools/contracts";
import {
  DEFAULT_T3WORK_THREAD_TOOL_IDS,
  listImplementedT3workToolCatalogEntries,
} from "@t3tools/project-context/t3workToolCatalog";

export {
  makeBrokerLayer,
  makeBrokerLayerWithLiveContextRefresh,
  makeBrokerLayerWithOptions,
} from "./t3work-toolBrokerTestLayers.ts";

export const threadId = ThreadId.make("thread-1");

export const DEFAULT_THREAD_TOOL_ALLOWED_GROUPS = [
  "integration.read",
  "view.state",
  "thread.handoff",
  "artifact.rw",
] as const;

type TestToolContextTool = {
  id: string;
  label: string;
  capabilities: ReadonlyArray<"read" | "write">;
};

const IMPLEMENTED_TOOL_BY_ID = new Map(
  listImplementedT3workToolCatalogEntries().map((tool) => [tool.id, tool]),
);

export function defaultThreadToolDescriptors(): ReadonlyArray<TestToolContextTool> {
  return DEFAULT_T3WORK_THREAD_TOOL_IDS.flatMap((toolId) => {
    const tool = IMPLEMENTED_TOOL_BY_ID.get(toolId);
    return tool ? [{ id: tool.id, label: tool.label, capabilities: [...tool.capabilities] }] : [];
  });
}

export function createThreadToolContext(input: {
  readonly tools: ReadonlyArray<TestToolContextTool>;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly view?: Partial<{
    kind: "thread";
    projectId: string;
    projectTitle: string;
    workspaceRoot: string;
    threadId: ThreadId;
    threadTitle: string;
    ticketId: string;
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
      ...(input.allowedToolGroups
        ? {
            kickoff: {
              workflow: {
                allowedToolGroups: [...input.allowedToolGroups],
              },
            },
          }
        : {}),
    },
  };
}

export function createDefaultThreadToolContext(input?: {
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly view?: Parameters<typeof createThreadToolContext>[0]["view"];
}) {
  return createThreadToolContext({
    tools: defaultThreadToolDescriptors(),
    allowedToolGroups: input?.allowedToolGroups ?? [...DEFAULT_THREAD_TOOL_ALLOWED_GROUPS],
    ...(input?.view ? { view: input.view } : {}),
  });
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
