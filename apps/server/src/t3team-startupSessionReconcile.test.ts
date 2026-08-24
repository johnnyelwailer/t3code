/**
 * t3team: startup reconciliation of stale projected sessions (crash recovery).
 */
import {
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationCommand,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { reconcileStaleSessionsAtStartup } from "./t3team-startupSessionReconcile.ts";

const now = "2026-08-24T15:00:00.000Z";

const thread = (id: string, sessionStatus: string | null) => ({
  id: ThreadId.make(id),
  projectId: "project-1",
  title: id,
  modelSelection: { instanceId: ProviderInstanceId.make("nexplore"), model: "medium" },
  interactionMode: "default",
  runtimeMode: "full-access",
  branch: null,
  worktreePath: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  latestTurn: null,
  messages: [],
  session:
    sessionStatus === null
      ? null
      : {
          threadId: ThreadId.make(id),
          status: sessionStatus,
          providerName: "nexplore",
          runtimeMode: "full-access",
          activeTurnId: sessionStatus === "running" ? TurnId.make("turn-1") : null,
          lastError: null,
          updatedAt: now,
        },
  activities: [],
  proposedPlans: [],
  checkpoints: [],
  deletedAt: null,
});

const readModel = {
  snapshotSequence: 10,
  updatedAt: now,
  projects: [],
  threads: [
    thread("crashed-running", "running"),
    thread("crashed-starting", "starting"),
    thread("healthy-stopped", "stopped"),
    thread("no-session", null),
  ],
} as unknown as OrchestrationReadModel;

const makeLayer = (dispatched: OrchestrationCommand[]) =>
  Layer.mergeAll(
    Layer.succeed(OrchestrationEngineService, {
      dispatch: (command: OrchestrationCommand) =>
        Effect.sync(() => {
          dispatched.push(command);
          return { sequence: 11 };
        }),
    } as unknown as OrchestrationEngineShape),
    Layer.succeed(ProjectionSnapshotQuery, {
      getCommandReadModel: () => Effect.succeed(readModel),
    } as unknown as ProjectionSnapshotQueryShape),
  );

it.layer(NodeServices.layer)("startup session reconcile", (it) => {
  it.effect("stops every running/starting session, clears activeTurnId, skips healthy ones", () =>
    Effect.gen(function* () {
      const dispatched: OrchestrationCommand[] = [];
      yield* reconcileStaleSessionsAtStartup().pipe(Effect.provide(makeLayer(dispatched)));

      expect(dispatched).toHaveLength(2);
      const byThread = new Map(
        dispatched.map((command) => [(command as { threadId: string }).threadId, command]),
      );
      expect([...byThread.keys()].sort()).toEqual(["crashed-running", "crashed-starting"]);
      for (const command of dispatched) {
        expect(command.type).toBe("thread.session.set");
        const session = (command as { session: { status: string; activeTurnId: unknown } }).session;
        expect(session.status).toBe("stopped");
        expect(session.activeTurnId).toBeNull();
      }
    }),
  );
});
