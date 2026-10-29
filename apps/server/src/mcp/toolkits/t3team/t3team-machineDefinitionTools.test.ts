import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { MachineDefinitionFinder } from "../../../project/t3team-MachineDefinitionFinder.ts";
import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import { T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamAskUserWriter } from "./t3team-askUserWriter.ts";

const threadId = ThreadId.make("thread-machine-find");
const threadProject = ProjectId.make("project-of-the-thread");
const otherProject = ProjectId.make("another-project");
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-machine-find"),
  requestNamespace: "provider-session-machine-find",
  thread: {
    threadId,
    providerSessionId: "provider-session-machine-find",
    providerInstanceId: ProviderInstanceId.make("pack-test"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "machine-find-test", version: "1.0.0" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "machine-find-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const answer = {
  candidates: [],
  checked: [{ repository: "acme/api", refs: ["main"], omitted: 0 }],
  unreadable: [],
  setupHints: [],
};

const callTool = (
  args: { readonly projectId?: string },
  finder: Layer.Layer<MachineDefinitionFinder> | undefined,
) => {
  const services = Layer.mergeAll(
    Layer.mock(ThreadManagementService.ThreadManagementService)({
      getThreadShell: () =>
        Effect.succeed({
          projectId: threadProject,
          deletedAt: null,
        } as never),
    }),
    Layer.mock(T3TeamAskUserWriter)({}),
    finder ?? Layer.empty,
  );
  const TestLayer = T3TeamToolkitRegistrationLive.pipe(
    Layer.provide(services),
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(
      Layer.succeed(
        T3TeamToolBroker,
        T3TeamToolBroker.of({
          bindSession: () => Effect.succeed(undefined),
          bindReadOnly: () => Effect.succeed(undefined),
        }),
      ),
    ),
  );
  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    return yield* server.callTool({ name: "t3_machine_find_definitions", arguments: args });
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
};

it.effect("searches the calling thread's project by default and returns the search result", () => {
  const searched: Array<ProjectId> = [];
  const finder = Layer.succeed(
    MachineDefinitionFinder,
    MachineDefinitionFinder.of({
      find: (projectId) =>
        Effect.sync(() => {
          searched.push(projectId);
          return answer;
        }),
    }),
  );
  return Effect.gen(function* () {
    const result = yield* callTool({}, finder);
    expect(result.structuredContent).toEqual(answer);
    expect(searched).toEqual([threadProject]);
  });
});

it.effect("searches the project the agent names instead", () => {
  const searched: Array<ProjectId> = [];
  const finder = Layer.succeed(
    MachineDefinitionFinder,
    MachineDefinitionFinder.of({
      find: (projectId) =>
        Effect.sync(() => {
          searched.push(projectId);
          return answer;
        }),
    }),
  );
  return Effect.gen(function* () {
    yield* callTool({ projectId: otherProject }, finder);
    expect(searched).toEqual([otherProject]);
  });
});

it.effect("refuses clearly where the server has no finder", () =>
  Effect.gen(function* () {
    const result = yield* callTool({}, undefined);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("cannot be searched on this server");
  }),
);
