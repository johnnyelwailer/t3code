import { CommandId, EventId, ProjectId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const asEventId = (value: string): EventId => EventId.make(value);
const asProjectId = (value: string): ProjectId => ProjectId.make(value);

const atlassianSource = {
  provider: "atlassian" as const,
  accountId: "acct-1",
  externalProjectId: "ext-1",
};

it.layer(NodeServices.layer)("decider project source binding", (it) => {
  it.effect("emits `source` on project.create", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const readModel = createEmptyReadModel(now);

      const result = yield* decideOrchestrationCommand({
        command: {
          type: "project.create",
          commandId: CommandId.make("cmd-project-create-source"),
          projectId: asProjectId("project-source"),
          title: "Bound",
          workspaceRoot: "/tmp/bound",
          createdAt: now,
          source: atlassianSource,
        },
        readModel,
      });

      const event = Array.isArray(result) ? result[0] : result;
      expect(event.type).toBe("project.created");
      expect((event.payload as { source?: unknown }).source).toEqual(atlassianSource);
    }),
  );

  it.effect(
    "rejects project.create claiming a (provider, accountId, externalProjectId) already bound",
    () =>
      Effect.gen(function* () {
        const now = "2026-01-01T00:00:00.000Z";
        const initial = createEmptyReadModel(now);
        const readModel = yield* projectEvent(initial, {
          sequence: 1,
          eventId: asEventId("evt-project-create-first"),
          aggregateKind: "project",
          aggregateId: asProjectId("project-first"),
          type: "project.created",
          occurredAt: now,
          commandId: CommandId.make("cmd-project-create-first"),
          causationEventId: null,
          correlationId: CommandId.make("cmd-project-create-first"),
          metadata: {},
          payload: {
            projectId: asProjectId("project-first"),
            title: "First",
            workspaceRoot: "/tmp/project-first",
            defaultModelSelection: null,
            scripts: [],
            createdAt: now,
            updatedAt: now,
            source: atlassianSource,
          },
        });

        const failure = yield* Effect.flip(
          decideOrchestrationCommand({
            command: {
              type: "project.create",
              commandId: CommandId.make("cmd-project-create-second"),
              projectId: asProjectId("project-second"),
              title: "Second",
              workspaceRoot: "/tmp/project-second",
              createdAt: now,
              source: atlassianSource,
            },
            readModel,
          }),
        );

        expect(failure.message).toContain("project-first");
      }),
  );

  it.effect("emits `source` on project.meta.update", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const initial = createEmptyReadModel(now);
      const readModel = yield* projectEvent(initial, {
        sequence: 1,
        eventId: asEventId("evt-project-create"),
        aggregateKind: "project",
        aggregateId: asProjectId("project-rebind"),
        type: "project.created",
        occurredAt: now,
        commandId: CommandId.make("cmd-project-create"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-project-create"),
        metadata: {},
        payload: {
          projectId: asProjectId("project-rebind"),
          title: "Unbound",
          workspaceRoot: "/tmp/rebind",
          defaultModelSelection: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
        },
      });

      const result = yield* decideOrchestrationCommand({
        command: {
          type: "project.meta.update",
          commandId: CommandId.make("cmd-project-rebind"),
          projectId: asProjectId("project-rebind"),
          source: atlassianSource,
        },
        readModel,
      });

      const event = Array.isArray(result) ? result[0] : result;
      expect(event.type).toBe("project.meta-updated");
      expect((event.payload as { source?: unknown }).source).toEqual(atlassianSource);
    }),
  );

  it.effect("project.meta.update without `source` does not clear an existing binding", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const initial = createEmptyReadModel(now);
      const readModel = yield* projectEvent(initial, {
        sequence: 1,
        eventId: asEventId("evt-project-create-bound"),
        aggregateKind: "project",
        aggregateId: asProjectId("project-bound"),
        type: "project.created",
        occurredAt: now,
        commandId: CommandId.make("cmd-project-create-bound"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-project-create-bound"),
        metadata: {},
        payload: {
          projectId: asProjectId("project-bound"),
          title: "Bound",
          workspaceRoot: "/tmp/already-bound",
          defaultModelSelection: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
          source: atlassianSource,
        },
      });

      const result = yield* decideOrchestrationCommand({
        command: {
          type: "project.meta.update",
          commandId: CommandId.make("cmd-project-retitle"),
          projectId: asProjectId("project-bound"),
          title: "Bound (renamed)",
        },
        readModel,
      });

      const event = Array.isArray(result) ? result[0] : result;
      expect(event.type).toBe("project.meta-updated");
      expect((event.payload as { source?: unknown }).source).toBeUndefined();
    }),
  );
});
