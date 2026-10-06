/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
import { describe, expect, it, vi } from "vite-plus/test";

import * as Effect from "effect/Effect";

// The orchestration (workflow) tool wiring is ported separately; these tests cover the broker's
// own binding and host tools, so stand the workflow tools in as "not wired".
vi.mock("./t3team-toolBrokerWorkflowToolsWiring.ts", () => ({
  makeWorkflowToolsForThread: () => Effect.succeed({}),
}));

import { T3TeamToolBroker, T3TEAM_CURRENT_VIEW_RESOURCE_URI } from "./t3team-toolBroker.ts";
import { T3TEAM_GENERIC_THREAD_TOOL_IDS } from "./t3team-toolBrokerLive.ts";
import {
  createThreadToolContext,
  makeBrokerLayer,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";

const bind = (toolContext?: ReturnType<typeof createThreadToolContext>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const broker = yield* T3TeamToolBroker;
      return yield* broker.bindSession({
        threadId,
        ...(toolContext === undefined ? {} : { toolContext }),
      });
    }).pipe(Effect.provide(makeBrokerLayer())),
  );

describe("T3TeamToolBrokerLive", () => {
  it("lists selected tools and returns the current V2 view payload", async () => {
    const binding = await bind(
      createThreadToolContext({
        tools: [{ id: "t3team.view.read", label: "Read view", capabilities: ["read"] }],
      }),
    );

    expect(binding?.listServers()).toEqual([
      expect.objectContaining({
        name: "t3team",
        tools: {
          "t3team.view.read": expect.objectContaining({ title: "Read current t3team view" }),
        },
        resources: [
          expect.objectContaining({
            uri: T3TEAM_CURRENT_VIEW_RESOURCE_URI,
            name: "Current t3team view",
          }),
        ],
      }),
    ]);

    const result = await Effect.runPromise(
      binding!.callTool({ server: "t3team", tool: "t3team.view.read" }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ id: "project-1" }),
        thread: expect.objectContaining({
          id: threadId,
          title: "Original title",
          messageCount: 0,
          latestRunId: null,
          executionScope: "metarepo",
          workspace: expect.objectContaining({
            executionScope: "metarepo",
            currentWorkspaceRoot: "/workspace/project-1",
            projectWorkspaceRoot: "/workspace/project-1",
            worktreePath: null,
          }),
        }),
      }),
    );
  });

  it("falls back to the stored thread tool context when no toolContext is passed", async () => {
    const binding = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        yield* broker.bindSession({
          threadId,
          toolContext: createThreadToolContext({
            tools: [{ id: "t3team.view.read", label: "Read view", capabilities: ["read"] }],
          }),
        });
        return yield* broker.bindSession({ threadId });
      }).pipe(Effect.provide(makeBrokerLayer())),
    );

    expect(binding?.listServers()).toEqual([
      expect.objectContaining({
        tools: {
          "t3team.view.read": expect.objectContaining({ title: "Read current t3team view" }),
        },
      }),
    ]);
  });

  it("binds the generic host tools without a stored view context", async () => {
    const binding = await bind();
    expect(Object.keys(binding?.listServers()[0]?.tools ?? {}).toSorted()).toEqual(
      [...T3TEAM_GENERIC_THREAD_TOOL_IDS].toSorted(),
    );
  });

  it("no longer serves the child spawn, rename and model tools upstream replaced", async () => {
    const binding = await bind(
      createThreadToolContext({
        tools: ["t3team.thread.start_child", "t3team.thread.rename", "t3team.runtime.models"].map(
          (id) => ({ id, label: id, capabilities: ["write"] as const }),
        ),
      }),
    );
    expect(binding?.listServers()[0]?.tools).toEqual({});
    for (const tool of ["t3team.thread.start_child", "t3team.thread.rename"]) {
      const result = await Effect.runPromise(binding!.callTool({ server: "t3team", tool }));
      expect(result.isError).toBe(true);
    }
  });

  it("answers the children tool from the V2 thread", async () => {
    const binding = await bind();
    const result = await Effect.runPromise(
      binding!.callTool({
        server: "t3team",
        tool: "t3team.thread.children",
        arguments: { op: "environments" },
      }),
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({ ok: true, op: "environments" }),
    );
  });
});
