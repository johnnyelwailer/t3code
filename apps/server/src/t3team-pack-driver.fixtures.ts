/**
 * A scripted pack provider for the pack-bridge tests: a Promise/JSON `PackProviderInstance` whose
 * session records every call and emits `ProviderAdapterV2Event` JSON on demand.
 */
import type {
  PackContinuationRequest,
  PackJson,
  PackOpenSessionInput,
  PackProviderDriverDefinition,
  PackProviderInstance,
  PackSessionRuntime,
  PackTurnInput,
} from "@t3team/pack-api";
import * as Schema from "effect/Schema";

import { CodexProviderCapabilitiesV2 } from "./orchestration-v2/Adapters/CodexAdapterV2.ts";
import { PackCodec } from "./t3team-pack-driverCodec.ts";

export const PACK_DRIVER = "example";
export const NOW = "2026-10-03T00:00:00.000Z";
export const CAPABILITIES_JSON = Schema.encodeSync(PackCodec.capabilities)(
  CodexProviderCapabilitiesV2,
) as PackJson;

/** Async iterable fed by `push`; ends on `end`. */
export const makePushIterable = () => {
  const buffer: unknown[] = [];
  let wake: (() => void) | undefined;
  let done = false;
  const notify = () => {
    const resolve = wake;
    wake = undefined;
    resolve?.();
  };
  return {
    push: (value: unknown) => {
      buffer.push(value);
      notify();
    },
    end: () => {
      done = true;
      notify();
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        while (true) {
          if (buffer.length > 0) {
            yield buffer.shift();
            continue;
          }
          if (done) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      },
    } satisfies AsyncIterable<unknown>,
  };
};

export const providerThreadJson = (threadId: string, providerSessionId: string): PackJson => ({
  id: `provider-thread:${threadId}`,
  driver: PACK_DRIVER,
  providerInstanceId: PACK_DRIVER,
  providerSessionId,
  appThreadId: threadId,
  ownerNodeId: null,
  nativeThreadRef: { driver: PACK_DRIVER, nativeId: `native:${threadId}`, strength: "strong" },
  nativeConversationHeadRef: null,
  status: "idle",
  firstRunOrdinal: null,
  lastRunOrdinal: null,
  handoffIds: [],
  forkedFrom: null,
  createdAt: NOW,
  updatedAt: NOW,
});

/** Host `ProviderAdapterV2TurnInput` JSON for one user turn on `threadId`. */
export const turnInputJson = (threadId: string, providerSessionId: string): PackJson => ({
  appThread: {
    createdBy: "user",
    creationSource: "web",
    id: threadId,
    projectId: "project-1",
    title: "Example thread",
    providerInstanceId: PACK_DRIVER,
    modelSelection: { instanceId: PACK_DRIVER, model: "example/model" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: `provider-thread:${threadId}`,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
    forkedFrom: null,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    deletedAt: null,
  },
  threadId,
  runId: `run:${threadId}`,
  runOrdinal: 1,
  providerTurnOrdinal: 1,
  attemptId: `attempt:${threadId}`,
  rootNodeId: `node:${threadId}`,
  providerThread: providerThreadJson(threadId, providerSessionId),
  message: {
    messageId: `message:${threadId}`,
    text: "hello",
    attachments: [],
    createdBy: "user",
    creationSource: "web",
  },
  modelSelection: { instanceId: PACK_DRIVER, model: "example/model" },
  runtimePolicy: { runtimeMode: "full-access", interactionMode: "default", cwd: "/work" },
});

/** The events a pack emits to run one turn to `completed`. */
export const completedTurnEvents = (turn: PackTurnInput): ReadonlyArray<PackJson> => {
  const providerThreadId = String(turn.providerThread.id);
  const providerTurn = {
    id: `provider-turn:${turn.attemptId}`,
    providerThreadId,
    nodeId: turn.rootNodeId,
    runAttemptId: turn.attemptId,
    nativeTurnRef: {
      driver: PACK_DRIVER,
      nativeId: `native:${turn.attemptId}`,
      strength: "strong",
    },
    ordinal: turn.providerTurnOrdinal,
    status: "running",
    startedAt: NOW,
    completedAt: null,
  };
  return [
    { type: "provider_turn.updated", driver: PACK_DRIVER, providerTurn },
    {
      type: "provider_turn.updated",
      driver: PACK_DRIVER,
      providerTurn: { ...providerTurn, status: "completed", completedAt: NOW },
    },
    {
      type: "turn.terminal",
      driver: PACK_DRIVER,
      providerThreadId,
      providerTurnId: providerTurn.id,
      runOrdinal: turn.runOrdinal,
      status: "completed",
      failure: null,
      threadDisposition: "reusable",
    },
  ];
};

export interface ScriptedPack {
  readonly log: string[];
  readonly opened: PackOpenSessionInput[];
  readonly turns: PackTurnInput[];
  readonly events: ReturnType<typeof makePushIterable>;
  readonly requestContinuation: (request: PackContinuationRequest) => void;
  readonly instance: PackProviderInstance;
  readonly definition: PackProviderDriverDefinition;
}

export const makeScriptedPack = (
  options: {
    readonly cwd?: string;
    readonly autoComplete?: boolean;
    readonly session?: Partial<PackSessionRuntime>;
  } = {},
): ScriptedPack => {
  const log: string[] = [];
  const opened: PackOpenSessionInput[] = [];
  const turns: PackTurnInput[] = [];
  const events = makePushIterable();
  let host: PackOpenSessionInput["host"] | undefined;
  const session = (input: PackOpenSessionInput): PackSessionRuntime => ({
    providerSession: {
      status: "ready",
      cwd: options.cwd ?? "/tmp",
      model: null,
      capabilities: CAPABILITIES_JSON,
      createdAt: NOW,
      updatedAt: NOW,
      lastError: null,
    },
    events: () => events.iterable,
    ensureThread: async ({ threadId }) => providerThreadJson(threadId, input.providerSessionId),
    resumeThread: async ({ providerThread }) => providerThread,
    startTurn: async (turn) => {
      turns.push(turn);
      log.push(`startTurn:${turn.message.createdBy}:${turn.message.creationSource}`);
      if (options.autoComplete !== false) {
        for (const event of completedTurnEvents(turn)) events.push(event);
      }
    },
    interruptTurn: async () => {
      log.push("interruptTurn");
    },
    respondToRuntimeRequest: async () => undefined,
    readThreadSnapshot: async ({ providerThread }) => ({
      providerThread,
      providerTurns: [],
      messages: [],
      runtimeRequests: [],
    }),
    close: async () => {
      log.push("close");
      events.end();
    },
    ...options.session,
  });
  const instance: PackProviderInstance = {
    snapshot: () => ({
      displayName: "Example",
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      models: [{ slug: "example/model", name: "Example model" }],
    }),
    orchestration: {
      getCapabilities: async () => CAPABILITIES_JSON,
      openSession: async (input) => {
        opened.push(input);
        host = input.host;
        log.push(`open:${input.providerSessionId}`);
        return session(input);
      },
    },
    dispose: async () => {
      log.push("dispose");
    },
  };
  return {
    log,
    opened,
    turns,
    events,
    requestContinuation: (request) => host?.requestContinuation(request),
    instance,
    definition: {
      schemaVersion: 2,
      driver: PACK_DRIVER,
      displayName: "Example",
      create: async () => instance,
    },
  };
};
