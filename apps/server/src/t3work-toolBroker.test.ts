import { describe, expect, it, vi } from "vitest";
import { ThreadId } from "@t3tools/contracts";

import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3workToolBroker, T3WORK_CURRENT_VIEW_RESOURCE_URI } from "./t3work-toolBroker.ts";
import {
  makeBrokerLayer,
  makeBrokerLayerWithOptions,
  threadId,
} from "./t3work-toolBrokerTestUtils.ts";

describe("T3workToolBrokerLive", () => {
  it("lists selected tools and returns the current view payload", async () => {
    const orchestrationMock: OrchestrationEngineShape = {
      readEvents: () => Stream.empty,
      dispatch: () => Effect.succeed({ sequence: 1 }),
      streamDomainEvents: Stream.empty,
    };

    const binding = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        return yield* broker.bindSession({
          threadId,
          toolContext: {
            surface: "t3work",
            tools: [{ id: "t3work.view.read", label: "Read view", capabilities: ["read"] }],
            state: {
              view: {
                kind: "thread",
                projectId: "project-1",
                projectTitle: "Project One",
                workspaceRoot: "/workspace/project-1",
                threadId,
                threadTitle: "Original title",
              },
            },
          },
        });
      }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
    );

    expect(binding?.listServers()).toEqual([
      expect.objectContaining({
        name: "t3work",
        tools: {
          "t3work.view.read": expect.objectContaining({ title: "Read current t3work view" }),
        },
        resources: [
          expect.objectContaining({
            uri: T3WORK_CURRENT_VIEW_RESOURCE_URI,
            name: "Current t3work view",
          }),
        ],
      }),
    ]);

    const result = await Effect.runPromise(
      binding!.callTool({ server: "t3work", tool: "t3work.view.read" }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ id: "project-1" }),
        thread: expect.objectContaining({ id: threadId, title: "Original title" }),
      }),
    );
  });

  it("dispatches thread metadata updates for rename", async () => {
    const dispatch = vi.fn((_command: unknown) => Promise.resolve({ sequence: 7 }));
    const orchestrationMock: OrchestrationEngineShape = {
      readEvents: () => Stream.empty,
      dispatch: (command) => Effect.promise(() => dispatch(command)),
      streamDomainEvents: Stream.empty,
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: {
            surface: "t3work",
            tools: [
              {
                id: "t3work.thread.rename",
                label: "Rename thread",
                capabilities: ["write"],
              },
            ],
            state: {
              view: {
                kind: "thread",
                projectId: "project-1",
                projectTitle: "Project One",
                workspaceRoot: "/workspace/project-1",
                threadId,
                threadTitle: "Original title",
              },
            },
          },
        });
        return yield* binding!.callTool({
          server: "t3work",
          tool: "t3work.thread.rename",
          arguments: { title: "  Updated title  " },
        });
      }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
    );

    expect(result).toEqual(
      expect.objectContaining({
        structuredContent: {
          ok: true,
          threadId,
          title: "Updated title",
        },
      }),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        type: "thread.meta.update",
        threadId,
        title: "Updated title",
      }),
    );
  });

  it("falls back to the stored thread tool context when no toolContext is passed", async () => {
    const orchestrationMock: OrchestrationEngineShape = {
      readEvents: () => Stream.empty,
      dispatch: () => Effect.succeed({ sequence: 1 }),
      streamDomainEvents: Stream.empty,
    };

    const binding = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        yield* broker.bindSession({
          threadId,
          toolContext: {
            surface: "t3work",
            tools: [{ id: "t3work.view.read", label: "Read view", capabilities: ["read"] }],
            state: {
              view: {
                kind: "thread",
                projectId: "project-1",
                projectTitle: "Project One",
                workspaceRoot: "/workspace/project-1",
                threadId,
                threadTitle: "Original title",
              },
            },
          },
        });
        return yield* broker.bindSession({ threadId });
      }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
    );

    expect(binding?.listServers()).toEqual([
      expect.objectContaining({
        tools: {
          "t3work.view.read": expect.objectContaining({ title: "Read current t3work view" }),
        },
      }),
    ]);
  });

  it("creates and optionally starts a child session with session-style arguments", async () => {
    const dispatch = vi.fn((_command: unknown) => Promise.resolve({ sequence: 11 }));
    const orchestrationMock: OrchestrationEngineShape = {
      readEvents: () => Stream.empty,
      dispatch: (command) => Effect.promise(() => dispatch(command)),
      streamDomainEvents: Stream.empty,
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: {
            surface: "t3work",
            tools: [
              {
                id: "t3work.thread.start_child",
                label: "Start child session",
                capabilities: ["write"],
              },
            ],
            state: {
              view: {
                kind: "thread",
                projectId: "project-1",
                projectTitle: "Project One",
                workspaceRoot: "/workspace/project-1",
                threadId,
                threadTitle: "Original title",
                ticketId: "PROJ-123",
              },
            },
          },
        });

        expect(binding).toBeDefined();

        const result = yield* binding!.callTool({
          server: "t3work",
          tool: "t3work.thread.start_child",
          arguments: {
            name: "Child session",
            kickoff_prompt: "Investigate the flaky checkout flow",
            kickoff_mode: "plan",
            model: "gpt-5.4",
            reasoning_effort: "high",
          },
        });

        const childThreadId = ThreadId.make(
          (result.structuredContent as { project_session_id: string }).project_session_id,
        );
        const childBinding = yield* broker.bindSession({ threadId: childThreadId });

        expect(childBinding?.listServers()).toEqual([
          expect.objectContaining({
            tools: {
              "t3work.thread.start_child": expect.objectContaining({
                title: "Start child session",
              }),
            },
          }),
        ]);

        return result;
      }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
    );

    expect(result).toEqual(
      expect.objectContaining({
        structuredContent: expect.objectContaining({
          ok: true,
          project_session_id: expect.any(String),
          name: "Child session",
          started: true,
          requested_kickoff_mode: "plan",
          interaction_mode: "plan",
        }),
      }),
    );

    const childThreadId = (result.structuredContent as { project_session_id: string })
      .project_session_id;

    expect(dispatch.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            type: "thread.create",
            threadId: childThreadId,
            projectId: "project-1",
            title: "Child session",
            runtimeMode: "full-access",
            interactionMode: "plan",
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
              options: [{ id: "reasoningEffort", value: "high" }],
            },
          }),
        ],
        [
          expect.objectContaining({
            type: "thread.activity.append",
            threadId,
            activity: expect.objectContaining({
              kind: "t3work.handoff.started",
              payload: expect.objectContaining({
                parentThreadId: threadId,
                childThreadId,
                ticketId: "PROJ-123",
              }),
            }),
          }),
        ],
        [
          expect.objectContaining({
            type: "thread.activity.append",
            threadId: childThreadId,
            activity: expect.objectContaining({
              kind: "t3work.handoff.created",
              payload: expect.objectContaining({
                parentThreadId: threadId,
                childThreadId,
                ticketId: "PROJ-123",
              }),
            }),
          }),
        ],
        [
          expect.objectContaining({
            type: "thread.turn.start",
            threadId: childThreadId,
            runtimeMode: "full-access",
            interactionMode: "plan",
            message: expect.objectContaining({
              role: "user",
              text: "Investigate the flaky checkout flow",
            }),
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
              options: [{ id: "reasoningEffort", value: "high" }],
            },
          }),
        ],
      ]),
    );
  });

  it("creates a child session without optional repo services", async () => {
    const dispatch = vi.fn((_command: unknown) => Promise.resolve({ sequence: 13 }));
    const orchestrationMock: OrchestrationEngineShape = {
      readEvents: () => Stream.empty,
      dispatch: (command) => Effect.promise(() => dispatch(command)),
      streamDomainEvents: Stream.empty,
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3workToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: {
            surface: "t3work",
            tools: [
              {
                id: "t3work.thread.start_child",
                label: "Start child session",
                capabilities: ["write"],
              },
            ],
            state: {
              view: {
                kind: "thread",
                projectId: "project-1",
                projectTitle: "Project One",
                workspaceRoot: "/workspace/project-1",
                threadId,
                threadTitle: "Original title",
              },
            },
          },
        });

        return yield* binding!.callTool({
          server: "t3work",
          tool: "t3work.thread.start_child",
          arguments: {
            name: "Child session",
          },
        });
      }).pipe(
        Effect.provide(
          makeBrokerLayerWithOptions(orchestrationMock, { includeStartChildServices: false }),
        ),
      ),
    );

    expect(result).toEqual(
      expect.objectContaining({
        structuredContent: expect.objectContaining({
          ok: true,
          name: "Child session",
          started: false,
          interaction_mode: "default",
          setup_script_status: "not-requested",
        }),
      }),
    );

    expect(dispatch.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            type: "thread.create",
            projectId: "project-1",
            title: "Child session",
            runtimeMode: "full-access",
            interactionMode: "default",
          }),
        ],
      ]),
    );
  });
});
