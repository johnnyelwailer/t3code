/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Broker integration bridges Effect for callTool assertions. */
import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import {
  createThreadToolContext,
  makeBrokerLayerWithLiveContextRefresh,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";
import {
  makeContextRefreshTestWorkspace,
  registerContextRefreshTestCleanup,
  writeContextRefreshTestJson,
} from "./t3team-contextRefreshTestFixtures.ts";
import { buildJiraTicketEntryPoint } from "@t3tools/project-context/t3teamContextPaths";

registerContextRefreshTestCleanup();

const orchestrationMock: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 1 }),
  streamDomainEvents: Stream.empty,
  subscribeDomainEvents: Effect.acquireRelease(Effect.succeed(Stream.empty), () => Effect.void),
  latestSequence: Effect.succeed(0),
};

const REFRESH_CONTEXT_TOOL = "t3team.work_item.refresh_context_bundle" as const;
const CHEAP_AGENT_MODEL = "gpt-5.4-mini" as const;

function runRefreshContextAgentTurn(input: { readonly root: string; readonly projectId: string }) {
  return Effect.gen(function* () {
    const broker = yield* T3TeamToolBroker;
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
      server: "t3team",
      tool: REFRESH_CONTEXT_TOOL,
      arguments: { ticket_key: "AC-91" },
    });
    const cached = yield* binding!.callTool({
      server: "t3team",
      tool: REFRESH_CONTEXT_TOOL,
      arguments: { ticket_key: "AC-91" },
    });
    return { refreshed, cached };
  }).pipe(
    Effect.provide(
      makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
        contextRefreshLayerPrefix: "t3team-broker-context-refresh-",
      }),
    ),
  );
}

describe("T3TeamToolBroker refresh_context_bundle integration", () => {
  it("refreshes via live service and returns already_synced on repeat", async () => {
    const { root, project } = makeContextRefreshTestWorkspace();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: createThreadToolContext({
            tools: [
              {
                id: "t3team.work_item.refresh_context_bundle",
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
          server: "t3team",
          tool: "t3team.work_item.refresh_context_bundle",
          arguments: { ticket_key: "AC-91" },
        });
        const cached = yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.work_item.refresh_context_bundle",
          arguments: { ticket_key: "AC-91" },
        });
        return { refreshed, cached };
      }).pipe(
        Effect.provide(
          makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
            contextRefreshLayerPrefix: "t3team-broker-context-refresh-",
          }),
        ),
      ),
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
    const result = await Effect.runPromise(
      runRefreshContextAgentTurn({ root, projectId: project.id }),
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

  it("resolves bound thread context displayId when refresh_context_bundle omits ticket_key", async () => {
    const { root, project } = makeContextRefreshTestWorkspace();
    writeContextRefreshTestJson(root, ".t3team/context/work-items/ac-91.json", {
      ticket: {
        id: "10001",
        ref: { id: "10001", displayId: "AC-91" },
      },
    });
    writeContextRefreshTestJson(root, ".t3team/context/work-items/index.json", {
      workItems: [
        {
          key: "ac-91",
          relativePath: ".t3team/context/work-items/ac-91.json",
          ticketEntryPointRelativePath: buildJiraTicketEntryPoint(project.id, "ac-91"),
        },
      ],
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: createThreadToolContext({
            tools: [
              {
                id: "t3team.work_item.refresh_context_bundle",
                label: "Refresh work item context bundle",
                capabilities: ["write"],
              },
            ],
            view: {
              projectId: project.id,
              workspaceRoot: root,
              ticketId: "10001",
              ticketDisplayId: "AC-91",
            },
          }),
          allowedToolGroups: ["artifact.rw"],
        });

        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.work_item.refresh_context_bundle",
          arguments: {},
        });
      }).pipe(
        Effect.provide(
          makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
            contextRefreshLayerPrefix: "t3team-broker-context-refresh-bound-",
          }),
        ),
      ),
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      ok: true,
      status: "synced",
      ticketKey: "AC-91",
      projectId: project.id,
    });
  });
});
