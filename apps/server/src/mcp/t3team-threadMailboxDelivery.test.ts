import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import {
  EnvironmentId,
  type OrchestrationV2ThreadProjection,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { expect, it } from "vite-plus/test";

import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ProviderRegistry from "../provider/Services/ProviderRegistry.ts";
import * as ScheduledTaskService from "../scheduledTasks/ScheduledTaskService.ts";
import type * as McpInvocationContext from "./McpInvocationContext.ts";
import * as OrchestratorMcpService from "./OrchestratorMcpService.ts";
import {
  ThreadMailboxDelivery,
  type ThreadMailboxSendInput,
} from "./t3team-threadMailboxDelivery.ts";

const projectId = ProjectId.make("project-mailbox");
const senderId = ThreadId.make("thread-mailbox-sender");
const targetId = ThreadId.make("thread-mailbox-target");
const now = DateTime.makeUnsafe("2026-10-03T12:00:00.000Z");
const instanceId = ProviderInstanceId.make("codex");

const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-mailbox"),
  threadId: senderId,
  providerSessionId: "provider-session-mailbox",
  providerInstanceId: instanceId,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};

const projection = (threadId: ThreadId) =>
  ({
    thread: {
      id: threadId,
      projectId,
      title: threadId,
      createdBy: "user",
      creationSource: "web",
      modelSelection: { instanceId, model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
      archivedAt: null,
      deletedAt: null,
      providerInstanceId: instanceId,
      createdAt: now,
      updatedAt: now,
    },
    runs: [],
    runtimeRequests: [],
    messages: [],
    contextTransfers: [],
    subagents: [],
    visibleTurnItems: [],
    updatedAt: now,
  }) as unknown as OrchestrationV2ThreadProjection;

const makeLayer = (mailbox: Layer.Layer<never>) =>
  OrchestratorMcpService.layer.pipe(
    Layer.provide(mailbox),
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadRecords: (threadId) => Effect.succeed(projection(threadId)),
          getProjectThreadRecords: (input) => Effect.succeed(projection(input.threadId)),
          sendToThread: () => Effect.die("mailbox mode must not start, queue or steer a run"),
        } satisfies Partial<ThreadManagementService.ThreadManagementService["Service"]>),
        Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
        Layer.mock(ScheduledTaskService.ScheduledTaskService)({
          list: () => Effect.succeed({ tasks: [] }),
        }),
        Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
          list: () => Effect.succeed([]),
        }),
        NodeCrypto.layer,
      ),
    ),
  );

it("t3_thread_send mode 'mailbox' hands the message to the registered mailbox", async () => {
  const received: ThreadMailboxSendInput[] = [];
  const mailbox = Layer.succeed(ThreadMailboxDelivery, {
    send: (input) =>
      Effect.sync(() => {
        received.push(input);
        return { state: "queued" as const };
      }),
  });
  await Effect.gen(function* () {
    const service = yield* OrchestratorMcpService.OrchestratorMcpService;
    const result = yield* service.sendToThread(scope, {
      threadId: targetId,
      message: "Rebase on main",
      mode: "mailbox",
      summary: "Rebase",
      urgent: true,
      clientRequestId: "req-1",
    });
    expect(result).toEqual({
      threadId: targetId,
      messageId: result.messageId,
      delivery: "mailbox",
    });
    expect(result.runId).toBeUndefined();
    expect(received).toEqual([
      {
        senderThreadId: senderId,
        targetThreadId: targetId,
        messageId: result.messageId,
        text: "Rebase on main",
        summary: "Rebase",
        urgent: true,
      },
    ]);
  }).pipe(Effect.provide(makeLayer(mailbox)), Effect.runPromise);
});

it("t3_thread_send mode 'mailbox' is rejected when no mailbox is registered", async () => {
  await Effect.gen(function* () {
    const service = yield* OrchestratorMcpService.OrchestratorMcpService;
    const error = yield* service
      .sendToThread(scope, { threadId: targetId, message: "hi", mode: "mailbox" })
      .pipe(Effect.flip);
    expect(error.code).toBe("invalid_request");
  }).pipe(Effect.provide(makeLayer(Layer.empty)), Effect.runPromise);
});
