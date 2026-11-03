import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  MACHINE_SOURCE_ACCEPT_LABEL,
  MACHINE_SOURCE_DECLINE_LABEL,
  MACHINE_SOURCE_QUESTION_HEADER,
  encodeMachineSourceQuestionId,
  type OrchestrationV2Run,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Orchestrator from "../../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../../orchestration-v2/ProjectionStore.ts";
import { CodexProviderCapabilitiesV2 } from "../../../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as ProviderAdapterRegistry from "../../../orchestration-v2/ProviderAdapterRegistry.ts";
import { layerWithRegistry } from "../../../orchestration-v2/testkit/ProviderReplayHarness.ts";
import { layerMemory as SqlitePersistenceMemory } from "../../../persistence/Sqlite.ts";
import * as ThreadLineage from "../../../t3team-v2/t3team-threadLineage.ts";
import * as ThreadMessageRecorder from "../../../t3team-v2/t3team-threadMessageRecorder.ts";
import * as ThreadWorkflowAsk from "../../../t3team-v2/t3team-threadWorkflowAsk.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import {
  getPackProviderOverlay,
  setPackProviderOverlay,
} from "../../../t3team-pack-providerOverlay.ts";
import { t3TeamAskUser } from "./t3team-askUser.ts";
import { T3TeamAskUserWriterLive } from "./t3team-askUserWriter.ts";

const codexInstance = ProviderInstanceId.make("codex");
const codexAdapter = {
  instanceId: codexInstance,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process in t3team-v2 tests"),
} as ProviderAdapter.ProviderAdapterV2["Service"];

// A pack provider (like the cloud session's `nexplore`): no entry in settings.json, so only the
// pack overlay carries its enabled state. The test layer never runs the provider, so it reuses
// Codex's capability surface.
const cloudInstance = ProviderInstanceId.make("nexplore");
const nexploreAdapter = {
  instanceId: cloudInstance,
  driver: ProviderDriverKind.make("nexplore"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process in t3team-v2 tests"),
} as ProviderAdapter.ProviderAdapterV2["Service"];

const TestLayer = Layer.mergeAll(
  SqlitePersistenceMemory,
  ProjectionStore.layer.pipe(Layer.provide(SqlitePersistenceMemory)),
  layerWithRegistry(
    { name: "t3team-machine-source-respond" },
    ProviderAdapterRegistry.layerFromAdapters([codexAdapter, nexploreAdapter]),
    { databaseLayer: SqlitePersistenceMemory, runEffectWorker: false },
  ).pipe(Layer.provide(Layer.empty)),
  ThreadMessageRecorder.layer.pipe(Layer.provide(SqlitePersistenceMemory)),
  ThreadLineage.layer.pipe(Layer.provide(SqlitePersistenceMemory)),
  ThreadWorkflowAsk.layer.pipe(Layer.provide(SqlitePersistenceMemory)),
  T3TeamAskUserWriterLive.pipe(Layer.provide(SqlitePersistenceMemory)),
);

const cloudProject = ProjectId.make("project:cloud");
const ACCEPT = MACHINE_SOURCE_ACCEPT_LABEL;
const DECLINE = MACHINE_SOURCE_DECLINE_LABEL;
const questionId = encodeMachineSourceQuestionId({
  repository: "https://nexplore.ghe.com/acme/tools.git",
  branch: "setup",
});

it.layer(TestLayer)("machine source on the cloud provider", (it) => {
  it.effect("registers the accepted answer (the pack provider gate passes on respond)", () =>
    Effect.gen(function* () {
      const savedOverlay = getPackProviderOverlay();
      setPackProviderOverlay({
        configMap: {
          [cloudInstance]: { driver: ProviderDriverKind.make("nexplore"), enabled: true },
        },
        driverDefinitions: new Map(),
      });
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:machine-source-respond");
      try {
        yield* orchestrator.dispatch({
          type: "thread.create",
          commandId: CommandId.make(`create:${threadId}`),
          threadId,
          projectId: cloudProject,
          title: "Cloud session",
          modelSelection: { instanceId: cloudInstance, model: "nexplore" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdBy: "user",
          creationSource: "web",
        });
        yield* orchestrator.dispatch({
          type: "message.dispatch",
          commandId: CommandId.make(`start:${threadId}`),
          threadId,
          messageId: MessageId.make(`start:${threadId}`),
          text: "Set up the machine",
          attachments: [],
          dispatchMode: { type: "start_immediately" },
          createdBy: "user",
          creationSource: "web",
        });
        const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
        const run = runs.at(-1) as OrchestrationV2Run;
        yield* projections.apply({
          id: EventId.make(`running:${threadId}`),
          type: "run.updated",
          threadId,
          runId: run.id,
          occurredAt: yield* DateTime.now,
          payload: { ...run, status: "running", startedAt: yield* DateTime.now },
        });
        const asked = yield* t3TeamAskUser(
          {
            header: MACHINE_SOURCE_QUESTION_HEADER,
            question:
              "Use acme/tools@setup as the project machine source.\n\nWhy: it carries the shared devcontainer.",
            options: [
              {
                label: ACCEPT,
                description: "Saves this repository and branch as the project's machine source.",
              },
              { label: DECLINE, description: "Leaves the project's machine source as it is." },
            ],
            allowFreeText: false,
          },
          threadId,
          questionId,
        );
        assert.strictEqual(asked.delivered, true);

        // Exactly what the mobile client sends for a single-choice machine-source question:
        // the trimmed option label, keyed by the question id, on the thread being viewed.
        yield* orchestrator.dispatch({
          type: "runtime-request.respond",
          commandId: CommandId.make("answer:machine-source"),
          threadId,
          requestId: asked.requestId,
          answers: { [questionId]: ACCEPT },
        });

        const records = yield* projections.getThreadRecords(threadId, [
          "runtimeRequests",
          "messages",
        ]);
        const request = records.runtimeRequests.find((entry) => entry.id === asked.requestId);
        assert.strictEqual(request?.status, "resolved");
        const answer = records.messages.find((message) => message.text.endsWith(ACCEPT));
        assert.ok(
          answer !== undefined,
          "the accepted answer should land as the user's next message",
        );
      } finally {
        setPackProviderOverlay(savedOverlay);
      }
    }),
  );
});
