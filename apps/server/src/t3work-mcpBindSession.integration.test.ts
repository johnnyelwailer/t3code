/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- MCP bind integration bridges Effect for broker assertions. */
import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";

import { DEFAULT_T3WORK_THREAD_TOOL_IDS } from "@t3tools/project-context/t3workToolCatalog";

import { maybeBindT3workBrokerForProviderThread } from "./t3work-mcpBindSession.ts";
import { TOOL_SPECS } from "./t3work-toolBrokerHelpers.ts";
import { readT3workToolBinding } from "./t3work-toolBrokerSessionRegistry.ts";
import { T3workThreadToolContextStore } from "./t3work-threadToolContextStore.ts";
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
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import * as Stream from "effect/Stream";

registerContextRefreshTestCleanup();

const orchestrationMock: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 1 }),
  streamDomainEvents: Stream.empty,
};

const REFRESH_CONTEXT_TOOL = "t3work.work_item.refresh_context_bundle" as const;

describe("t3work MCP broker bind session", () => {
  it("binds ticket thread context into the session registry for provider MCP", async () => {
    const { root, project } = makeContextRefreshTestWorkspace();
    const toolContext = createThreadToolContext({
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
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* T3workThreadToolContextStore;
        yield* store.put({ threadId, toolContext });
        const binding = yield* maybeBindT3workBrokerForProviderThread(threadId);
        expect(binding).toBeDefined();
        expect(readT3workToolBinding(threadId)?.listServers()).toEqual(binding!.listServers());
        const tools = binding!.listServers().find((server) => server.name === "t3work")?.tools;
        expect(tools?.[REFRESH_CONTEXT_TOOL]).toBeDefined();
      }).pipe(
        Effect.provide(
          makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
            contextRefreshLayerPrefix: "t3work-mcp-bind-",
          }),
        ),
      ),
    );
  });

  it("binds the full default thread tool catalog for provider MCP", async () => {
    const { root, project } = makeContextRefreshTestWorkspace();
    const toolContext = createDefaultThreadToolContext({
      view: {
        projectId: project.id,
        workspaceRoot: root,
        ticketId: "AC-91",
      },
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* T3workThreadToolContextStore;
        yield* store.put({ threadId, toolContext });
        const binding = yield* maybeBindT3workBrokerForProviderThread(threadId);
        expect(binding).toBeDefined();

        const tools = binding!.listServers().find((server) => server.name === "t3work")?.tools;
        for (const toolId of DEFAULT_T3WORK_THREAD_TOOL_IDS) {
          expect(tools?.[toolId]).toBeDefined();
          expect(TOOL_SPECS[toolId]).toBeDefined();
        }
        expect(Object.keys(tools ?? {})).toEqual([...DEFAULT_T3WORK_THREAD_TOOL_IDS]);
      }).pipe(
        Effect.provide(
          makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
            contextRefreshLayerPrefix: "t3work-mcp-bind-defaults-",
          }),
        ),
      ),
    );
  });
});
