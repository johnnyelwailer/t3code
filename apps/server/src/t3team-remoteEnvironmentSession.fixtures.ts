/**
 * A scripted cloud session for the `remoteEnvironment` session tests: a `RemoteEnvironmentApi`
 * whose remote thread is a `Ref` the test moves forward, a call log, and the open session over it.
 */
import {
  type CloudSessionFailedError,
  OrchestrationV2ConversationMessage,
  OrchestrationV2Run,
  OrchestrationV2RuntimeRequest,
  ProjectId,
  ProviderInstanceId,
  ProviderSessionId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { providerThreadJson, turnInputJson } from "./t3team-pack-driver.fixtures.ts";
import { PackCodec } from "./t3team-pack-driverCodec.ts";
import {
  RemoteEnvironmentError,
  type RemoteEnvironmentApi,
  type RemoteEnvironmentSessionDeps,
  type RemoteThreadView,
} from "./t3team-remoteEnvironmentApiTypes.ts";
import { remoteEnvironmentProviderSession } from "./t3team-remoteEnvironmentCapabilities.ts";
import { makeRemoteEnvironmentSession } from "./t3team-remoteEnvironmentSession.ts";
import { remoteEnvironmentModelSelection } from "./t3team-remoteEnvironmentTarget.ts";

const decodeRun = Schema.decodeUnknownSync(Schema.toCodecJson(OrchestrationV2Run));
const decodeMessage = Schema.decodeUnknownSync(
  Schema.toCodecJson(OrchestrationV2ConversationMessage),
);
const decodeRuntimeRequest = Schema.decodeUnknownSync(
  Schema.toCodecJson(OrchestrationV2RuntimeRequest),
);
const AT = "2026-10-24T22:00:00.000Z";
export const REPOSITORY = "nexplore.ghe.com/pj/nexi-machine-qa";
export const REMOTE_MODEL = { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" };

export const turn = {
  ...Schema.decodeUnknownSync(PackCodec.turnInput)(turnInputJson("thread-child", "session-1")),
  modelSelection: remoteEnvironmentModelSelection({
    sessionId: "run-41",
    modelSelection: REMOTE_MODEL,
  }),
};
export const providerThread = Schema.decodeUnknownSync(PackCodec.providerThread)(
  providerThreadJson("thread-child", "session-1"),
);

const run = (status: string, userMessageId: string = turn.message.messageId) =>
  decodeRun({
    id: "remote-run-1",
    threadId: "thread-child",
    ordinal: 1,
    providerInstanceId: "nexplore",
    modelSelection: { instanceId: "nexplore", model: "Standard" },
    providerThreadId: null,
    userMessageId,
    rootNodeId: null,
    activeAttemptId: null,
    status,
    requestedAt: AT,
    startedAt: AT,
    completedAt: null,
    checkpointId: null,
    contextHandoffId: null,
  });

const answer = (text: string) =>
  decodeMessage({
    id: "remote-message-1",
    threadId: "thread-child",
    runId: "remote-run-1",
    nodeId: null,
    role: "assistant",
    text,
    attachments: [],
    streaming: false,
    createdAt: AT,
    updatedAt: AT,
    createdBy: "agent",
    creationSource: "provider",
  });

const approval = decodeRuntimeRequest({
  id: "request-1",
  nodeId: "node-1",
  providerTurnId: null,
  nativeRequestRef: null,
  kind: "user_input",
  status: "pending",
  responseCapability: { type: "message" },
  createdAt: AT,
  resolvedAt: null,
});

export const view = (
  status: string | null,
  texts: ReadonlyArray<string> = [],
  pending = false,
  messageId: string = turn.message.messageId,
): RemoteThreadView => ({
  runs: status === null ? [] : [run(status, messageId)],
  messages: texts.map(answer),
  runtimeRequests: pending ? [approval] : [],
  turnItems: [],
});

export interface FakeRemote {
  readonly api: RemoteEnvironmentApi;
  readonly log: Ref.Ref<ReadonlyArray<string>>;
  readonly state: Ref.Ref<RemoteThreadView>;
  readonly ticks: Queue.Queue<void, RemoteEnvironmentError>;
  readonly dispatched: Deferred.Deferred<void>;
  readonly observed: Deferred.Deferred<void>;
  readonly remoteInterrupted: Deferred.Deferred<void>;
}

export const fakeRemote = Effect.fn("fakeRemote")(function* (input: {
  readonly cwd?: string;
  readonly repository?: string;
  readonly models?: ReadonlyArray<string>;
  readonly afterDispatch?: RemoteThreadView;
  readonly noIdentity?: boolean;
}) {
  const log = yield* Ref.make<ReadonlyArray<string>>([]);
  const state = yield* Ref.make(view(null));
  const launched = yield* Ref.make(false);
  const ticks = yield* Queue.unbounded<void, RemoteEnvironmentError>();
  const dispatched = yield* Deferred.make<void>();
  const observed = yield* Deferred.make<void>();
  const remoteInterrupted = yield* Deferred.make<void>();
  const note = (entry: string) => Ref.update(log, (entries) => [...entries, entry]);
  const api: RemoteEnvironmentApi = {
    serverConfig: Effect.succeed({
      cwd: input.cwd ?? "/work/nexi-machine-qa",
      projectFromCwd: true,
      providers: [
        {
          instanceId: ProviderInstanceId.make("nexplore"),
          enabled: true,
          models: (input.models ?? ["Standard"]).map((slug) => ({ slug })),
        },
      ],
    }),
    projects: Effect.succeed([
      {
        id: ProjectId.make("remote-project"),
        title: "nexi-machine-qa",
        workspaceRoot: "/work/nexi-machine-qa",
        ...(input.noIdentity === true
          ? {}
          : {
              repositoryIdentity: {
                canonicalKey: input.repository ?? REPOSITORY,
                locator: { source: "git-remote", remoteName: "origin", remoteUrl: "https://x/qa" },
              },
            }),
      },
    ]),
    launchThread: (launch) =>
      launch.reuseExistingThread === true
        ? Effect.fail(new RemoteEnvironmentError({ message: "reuse needs an existing thread" }))
        : note(`launch:${launch.threadId}:${launch.projectId}`).pipe(
            Effect.andThen(Ref.set(launched, true)),
          ),
    dispatchMessage: (message) =>
      note(`dispatch:${message.messageId}:${message.modelSelection.model}`).pipe(
        Effect.andThen(Ref.set(state, input.afterDispatch ?? view("running"))),
        Effect.andThen(Deferred.succeed(dispatched, undefined)),
      ),
    interruptRun: (value) =>
      note(`interrupt:${value.runId}`).pipe(
        Effect.andThen(Ref.set(state, view("interrupted"))),
        Effect.andThen(Queue.offer(ticks, undefined)),
        Effect.andThen(Deferred.succeed(remoteInterrupted, undefined)),
      ),
    projection: () =>
      Ref.get(launched).pipe(
        Effect.flatMap((exists) =>
          exists
            ? Ref.get(state)
            : Effect.fail(
                new RemoteEnvironmentError({ message: "No orchestration projection exists." }),
              ),
        ),
        Effect.tap((current) =>
          current.runs.length > 0 ? Deferred.succeed(observed, undefined) : Effect.void,
        ),
      ),
    updates: () => Stream.fromQueue(ticks),
  };
  return { api, log, state, ticks, dispatched, observed, remoteInterrupted } satisfies FakeRemote;
});

const providerSession = remoteEnvironmentProviderSession({
  providerSessionId: ProviderSessionId.make("session-1"),
  instanceId: ProviderInstanceId.make("remoteEnvironment"),
  cwd: "/tmp",
  now: DateTime.makeUnsafe(AT),
});

/** The grant a placed child gets; tests of the authorization itself pass their own. */
export const placedGrant: RemoteEnvironmentSessionDeps["authorize"] = () =>
  Effect.succeed({ sessionId: "run-41", repositoryKey: REPOSITORY, modelSelection: REMOTE_MODEL });

export const open = (
  remote: FakeRemote,
  failures: Ref.Ref<ReadonlyArray<CloudSessionFailedError | RemoteEnvironmentError>> | null = null,
  authorize: RemoteEnvironmentSessionDeps["authorize"] = placedGrant,
) =>
  makeRemoteEnvironmentSession(
    {
      open: () =>
        failures === null
          ? Effect.succeed(remote.api)
          : Effect.gen(function* () {
              const pending = yield* Ref.get(failures);
              const next = pending[0];
              if (next === undefined) return remote.api;
              yield* Ref.set(failures, pending.slice(1));
              return yield* next;
            }),
      authorize,
      reconnectAttempts: 2,
      interruptGrace: "50 millis",
    },
    {
      instanceId: ProviderInstanceId.make("remoteEnvironment"),
      providerSessionId: ProviderSessionId.make("session-1"),
      providerSession,
    },
  );
