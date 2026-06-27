/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
import { describe, expect, it } from "vite-plus/test";
import { createQueryable } from "@t3tools/project-context";

import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3workToolBroker } from "./t3work-toolBroker.ts";
import {
  createThreadToolContext,
  makeBrokerLayer,
  threadId,
} from "./t3work-toolBrokerTestUtils.ts";

const orchestrationMock: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 1 }),
  streamDomainEvents: Stream.empty,
};

function makeRenderContext() {
  return {
    surface: "workitem.detail.sidepanel" as const,
    project: {
      title: "Project One",
      provider: "atlassian",
    },
    workitem: {
      kind: "ticket" as const,
      displayId: "PROJ-42",
      type: "Bug",
      provider: "jira",
    },
    linkedResources: createQueryable([]),
    artifacts: createQueryable([]),
    profile: {
      technicalDepth: "medium" as const,
      brevity: "balanced" as const,
      guidanceStyle: "guided" as const,
      detailDensity: "balanced" as const,
      preferredArtifactKinds: ["implementation-plan"],
      defaultActionFamilies: ["engineering"],
      defaultRecipeWeights: {},
    },
    enabledSkillPacks: ["engineering"],
    schema: {},
    availableContextKeys: createQueryable(["ticket.summary"]),
  };
}

describe("T3workToolBroker allowed tool groups", () => {
  it("allows thread read tools and rejects disallowed write tools", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: createThreadToolContext({
            tools: [
              { id: "t3work.view.read", label: "Read view", capabilities: ["read"] },
              { id: "t3work.thread.rename", label: "Rename thread", capabilities: ["write"] },
            ],
          }),
          allowedToolGroups: ["integration.read"],
        });

        const readResult = yield* binding!.callTool({ server: "t3work", tool: "t3work.view.read" });
        const writeResult = yield* binding!.callTool({
          server: "t3work",
          tool: "t3work.thread.rename",
          arguments: { title: "Renamed" },
        });

        return { binding, readResult, writeResult };
      }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
    );

    expect(result.binding?.listServers()[0]?.tools).toEqual({
      "t3work.view.read": expect.objectContaining({ name: "t3work.view.read" }),
    });
    expect(result.readResult.isError).toBeUndefined();
    expect(result.writeResult.isError).toBe(true);
    expect(result.writeResult.content[0]?.text).toContain("requires group 'view.state'");
  });

  it("allows backlog view-state tools when the recipe declares view.state", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: {
            surface: "t3work",
            tools: [
              {
                id: "t3work.backlog.set_assignee_filter",
                label: "Set backlog assignee filter",
                capabilities: ["write"],
              },
            ],
            state: {
              view: {
                kind: "project-dashboard-backlog",
                projectId: "project-1",
                projectTitle: "Project One",
              },
              backlog: {
                state: {
                  assigneeFilter: "all",
                },
                currentUserDisplayName: "Pat Jones",
              },
            },
          },
          allowedToolGroups: ["view.state"],
        });

        const toolResult = yield* binding!.callTool({
          server: "t3work",
          tool: "t3work.backlog.set_assignee_filter",
          arguments: { mode: "current-user" },
        });

        return { binding, toolResult };
      }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
    );

    expect(result.binding?.listServers()[0]?.tools).toEqual({
      "t3work.backlog.set_assignee_filter": expect.objectContaining({
        name: "t3work.backlog.set_assignee_filter",
      }),
    });
    expect(result.toolResult.isError).toBeUndefined();
    expect(result.toolResult.structuredContent).toEqual({
      ok: true,
      applied: true,
      promptText: "The dashboard is now filtered to work assigned to Pat Jones.",
      viewStatePatch: {
        assigneeFilter: "Pat Jones",
      },
    });
  });

  it("rejects backlog view-state tools when the recipe omits view.state", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: {
            surface: "t3work",
            tools: [
              {
                id: "t3work.backlog.set_assignee_filter",
                label: "Set backlog assignee filter",
                capabilities: ["write"],
              },
            ],
            state: {
              backlog: {
                state: {
                  assigneeFilter: "all",
                },
                currentUserDisplayName: "Pat Jones",
              },
            },
          },
          allowedToolGroups: ["ui.render"],
        });

        return yield* binding!.callTool({
          server: "t3work",
          tool: "t3work.backlog.set_assignee_filter",
          arguments: { mode: "current-user" },
        });
      }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("requires group 'view.state'");
  });

  it("binds visibility in no-thread read-only mode", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindReadOnly({
          workspaceRoot: "/workspace/project-1",
          callerKind: "visibility",
          renderContext: makeRenderContext(),
          allowedToolGroups: ["integration.read"],
        });

        const readResult = yield* binding!.callTool({ server: "t3work", tool: "t3work.view.read" });
        const writeResult = yield* binding!.callTool({
          server: "t3work",
          tool: "t3work.thread.rename",
          arguments: { title: "Renamed" },
        });

        return { binding, readResult, writeResult };
      }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
    );

    expect(result.binding?.listServers()[0]?.tools).toEqual({
      "t3work.view.read": expect.objectContaining({ name: "t3work.view.read" }),
    });
    expect(result.readResult.structuredContent).toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ workspaceRoot: "/workspace/project-1" }),
        thread: null,
      }),
    );
    expect(result.writeResult.isError).toBe(true);
    expect(result.writeResult.content[0]?.text).toContain("requires group 'view.state'");
  });
});
