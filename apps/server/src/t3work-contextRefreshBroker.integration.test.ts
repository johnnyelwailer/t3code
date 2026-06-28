/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Broker integration bridges Effect for callTool assertions. */
import { DEFAULT_T3WORK_THREAD_TOOL_IDS } from "@t3tools/project-context/t3workToolCatalog";
import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3workToolBroker } from "./t3work-toolBroker.ts";
import {
  createDefaultThreadToolContext,
  createThreadToolContext,
  makeBrokerLayerWithLiveContextRefresh,
  threadId,
} from "./t3work-toolBrokerTestUtils.ts";
import {
  makeContextRefreshTestWorkspace,
  registerContextRefreshTestCleanup,
} from "./t3work-contextRefreshTestFixtures.ts";

registerContextRefreshTestCleanup();

const orchestrationMock: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 1 }),
  streamDomainEvents: Stream.empty,
};

const REFRESH_CONTEXT_TOOL = "t3work.work_item.refresh_context_bundle" as const;
const CHEAP_AGENT_MODEL = "gpt-5.4-mini" as const;

function runRefreshContextAgentTurn(
  input: { readonly root: string; readonly projectId: string },
  layer: ReturnType<typeof makeBrokerLayerWithLiveContextRefresh>,
) {
  return Effect.gen(function* () {
    const broker = yield* T3workToolBroker;
    const binding = yield* broker.bindSession({
      threadId,
      toolContext: createThreadToolContext({
        tools: [
          {
            id: REFRESH_CONTEXT_TOOL,
            label: "Refresh work item context bundle",
            capabilities: ["write"],
          },
        ],
        view: {
          projectId: input.projectId,
          workspaceRoot: input.root,
          ticketId: "AC-91",
        },
      }),
      allowedToolGroups: ["artifact.rw"],
    });

    const refreshed = yield* binding!.callTool({
      server: "t3work",
      tool: REFRESH_CONTEXT_TOOL,
      arguments: { ticket_key: "AC-91" },
    });
    const cached = yield* binding!.callTool({
      server: "t3work",
      tool: REFRESH_CONTEXT_TOOL,
      arguments: { ticket_key: "AC-91" },
    });
    return { refreshed, cached };
  }).pipe(Effect.provide(layer));
}

describe("T3workToolBroker refresh_context_bundle integration", () => {
  it("lists refresh_context_bundle on the bound broker surface", async () => {
    const { root, project } = makeContextRefreshTestWorkspace();
    const servers = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: createThreadToolContext({
            tools: [
              {
                id: REFRESH_CONTEXT_TOOL,
                label: "Refresh work item context bundle",
                capabilities: ["write"],
              },
            ],
            view: {
              projectId: project.id,
              workspaceRoot: root,
              ticketId: "AC-91",
            },
          }),
          allowedToolGroups: ["artifact.rw"],
        });
        return binding!.listServers();
      }).pipe(
        Effect.provide(
          makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
            contextRefreshLayerPrefix: "t3work-broker-context-refresh-list-",
          }),
        ),
      ),
    );

    const t3workServer = servers.find((server) => server.name === "t3work");
    expect(t3workServer?.tools?.[REFRESH_CONTEXT_TOOL]).toBeDefined();
  });

  it("lists all default thread tools on the bound broker surface", async () => {
    const { root, project } = makeContextRefreshTestWorkspace();
    const servers = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: createDefaultThreadToolContext({
            view: {
              projectId: project.id,
              workspaceRoot: root,
              ticketId: "AC-91",
            },
          }),
        });
        return binding!.listServers();
      }).pipe(
        Effect.provide(
          makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
            contextRefreshLayerPrefix: "t3work-broker-default-thread-tools-",
          }),
        ),
      ),
    );

    const tools = servers.find((server) => server.name === "t3work")?.tools;
    for (const toolId of DEFAULT_T3WORK_THREAD_TOOL_IDS) {
      expect(tools?.[toolId]).toBeDefined();
    }
    expect(Object.keys(tools ?? {})).toEqual([...DEFAULT_T3WORK_THREAD_TOOL_IDS]);
  });

  it("refreshes via live service and returns already_synced on repeat", async () => {
    const { root, project } = makeContextRefreshTestWorkspace();
    const brokerLayer = makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
      contextRefreshLayerPrefix: "t3work-broker-context-refresh-",
    });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: createThreadToolContext({
            tools: [
              {
                id: "t3work.work_item.refresh_context_bundle",
                label: "Refresh work item context bundle",
                capabilities: ["write"],
              },
            ],
            view: {
              projectId: project.id,
              workspaceRoot: root,
              ticketId: "AC-91",
            },
          }),
          allowedToolGroups: ["artifact.rw"],
        });

        const refreshed = yield* binding!.callTool({
          server: "t3work",
          tool: "t3work.work_item.refresh_context_bundle",
          arguments: { ticket_key: "AC-91" },
        });
        const cached = yield* binding!.callTool({
          server: "t3work",
          tool: "t3work.work_item.refresh_context_bundle",
          arguments: { ticket_key: "AC-91" },
        });
        return { refreshed, cached };
      }).pipe(Effect.provide(brokerLayer)),
    );

    expect(result.refreshed.isError).toBeUndefined();
    expect(result.refreshed.structuredContent).toMatchObject({
      ok: true,
      status: "synced",
      ticketKey: "AC-91",
      projectId: project.id,
    });
    const refreshedContent = result.refreshed.structuredContent as {
      readonly entryPointRelativePath?: string;
    };
    expect(result.cached.structuredContent).toMatchObject({
      ok: true,
      status: "already_synced",
      entryPointRelativePath: refreshedContent.entryPointRelativePath,
    });
  });

  it(`cheap agent eval (${CHEAP_AGENT_MODEL}): agent turn calls refresh_context_bundle synced then already_synced`, async () => {
    const { root, project } = makeContextRefreshTestWorkspace();
    const brokerLayer = makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
      contextRefreshLayerPrefix: "t3work-broker-context-refresh-agent-",
    });
    const result = await Effect.runPromise(
      runRefreshContextAgentTurn({ root, projectId: project.id }, brokerLayer),
    );

    expect(result.refreshed.isError).toBeUndefined();
    expect(result.refreshed.structuredContent).toMatchObject({
      ok: true,
      status: "synced",
      ticketKey: "AC-91",
      projectId: project.id,
    });
    const refreshedContent = result.refreshed.structuredContent as {
      readonly entryPointRelativePath?: string;
    };
    expect(result.cached.structuredContent).toMatchObject({
      ok: true,
      status: "already_synced",
      entryPointRelativePath: refreshedContent.entryPointRelativePath,
    });
  });
});
