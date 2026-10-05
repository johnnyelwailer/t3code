/**
 * Canonical JSON codecs for the pack provider boundary.
 *
 * Pack drivers speak the orchestration V2 adapter contract in plain JSON
 * (`@t3team/pack-api` provider-orchestration). Every host value handed to a
 * pack is encoded through `Schema.toCodecJson` of its contracts schema, and
 * every value a pack returns or emits is decoded through the same codec, so
 * the bridge is a 1:1 mapping with no event translation.
 *
 * @module t3team-pack-driverCodec
 */
import {
  CheckpointId,
  ModelSelection,
  NodeId,
  OrchestrationV2AppThread,
  OrchestrationV2ConversationMessage,
  OrchestrationV2HistoricalMessage,
  OrchestrationV2Notification,
  OrchestrationV2ProviderCapabilities,
  OrchestrationV2ProviderSession,
  OrchestrationV2ProviderThread,
  OrchestrationV2ProviderTurn,
  OrchestrationV2RuntimeRequest,
  ProviderApprovalDecision,
  ProviderJobControlRequest,
  ProviderJobControlResult,
  ProviderSessionId,
  ProviderTurnId,
  ProviderUserInputAnswers,
  RunAttemptId,
  RunId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import {
  ProviderAdapterV2Event,
  ProviderAdapterV2RuntimePolicy,
  ProviderAdapterV2TurnMessage,
} from "./orchestration-v2/ProviderAdapter.ts";

const Thread = OrchestrationV2ProviderThread;
const Turns = Schema.Array(OrchestrationV2ProviderTurn);

const TurnInput = Schema.Struct({
  appThread: OrchestrationV2AppThread,
  threadId: ThreadId,
  runId: RunId,
  runOrdinal: Schema.Number,
  providerTurnOrdinal: Schema.Number,
  restartContinuationOfRunId: Schema.optionalKey(RunId),
  attemptId: RunAttemptId,
  rootNodeId: NodeId,
  providerThread: Thread,
  message: ProviderAdapterV2TurnMessage,
  modelSelection: ModelSelection,
  runtimePolicy: ProviderAdapterV2RuntimePolicy,
});

const RollbackTarget = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("thread_start"),
    checkpointId: CheckpointId,
    appRunOrdinal: Schema.Literal(0),
  }),
  Schema.Struct({
    type: Schema.Literal("provider_turn"),
    checkpointId: CheckpointId,
    appRunOrdinal: Schema.Number,
    providerTurn: OrchestrationV2ProviderTurn,
  }),
]);

const ThreadSnapshot = Schema.Struct({
  providerThread: Thread,
  providerTurns: Turns,
  messages: Schema.Array(OrchestrationV2ConversationMessage),
  runtimeRequests: Schema.Array(OrchestrationV2RuntimeRequest),
  providerPayload: Schema.optionalKey(Schema.Unknown),
});

const SelectionTransitionPlan = Schema.Union([
  Schema.Struct({ type: Schema.Literal("apply_on_next_turn") }),
  Schema.Struct({ type: Schema.Literal("restart_session") }),
  Schema.Struct({ type: Schema.Literal("create_with_handoff") }),
  Schema.Struct({ type: Schema.Literal("reject"), reason: Schema.String }),
]);

const json = Schema.toCodecJson;

/**
 * The codecs encode to the generic `Schema.Json`; the pack contract names the concrete shape.
 * Narrowing happens only here, on values a codec just produced.
 */
export const asPack = <P>(encoded: Schema.Json): P => encoded as P;

/** One JSON codec per boundary shape; `Encoded` is what the pack sees. */
export const PackCodec = {
  capabilities: json(OrchestrationV2ProviderCapabilities),
  providerSession: json(OrchestrationV2ProviderSession),
  providerThread: json(Thread),
  event: json(ProviderAdapterV2Event),
  notification: json(OrchestrationV2Notification),
  selectionTransitionInput: json(
    Schema.Struct({
      current: ModelSelection,
      target: ModelSelection,
      sessionCapabilities: OrchestrationV2ProviderCapabilities,
    }),
  ),
  selectionTransitionPlan: json(SelectionTransitionPlan),
  openSessionInput: json(
    Schema.Struct({
      threadId: ThreadId,
      providerSessionId: ProviderSessionId,
      modelSelection: ModelSelection,
      runtimePolicy: ProviderAdapterV2RuntimePolicy,
      resumeFromSession: Schema.optionalKey(OrchestrationV2ProviderSession),
      initialNativeThreadId: Schema.optionalKey(Schema.String),
      initialProviderItemIdentityVersion: Schema.optionalKey(Schema.Literal(2)),
    }),
  ),
  ensureThreadInput: json(
    Schema.Struct({
      threadId: ThreadId,
      modelSelection: ModelSelection,
      runtimePolicy: ProviderAdapterV2RuntimePolicy,
      providerSessionId: Schema.optionalKey(ProviderSessionId),
      existingProviderThread: Schema.optionalKey(Thread),
    }),
  ),
  resumeThreadInput: json(
    Schema.Struct({
      providerThread: Thread,
      threadId: Schema.optionalKey(ThreadId),
      modelSelection: Schema.optionalKey(ModelSelection),
      runtimePolicy: Schema.optionalKey(ProviderAdapterV2RuntimePolicy),
    }),
  ),
  injectHistoryInput: json(
    Schema.Struct({
      messages: Schema.Array(OrchestrationV2HistoricalMessage),
      context: Schema.String,
      providerThread: Thread,
    }),
  ),
  turnInput: json(TurnInput),
  steerInput: json(
    Schema.Struct({
      threadId: ThreadId,
      runId: RunId,
      providerThread: Thread,
      providerTurnId: ProviderTurnId,
      message: ProviderAdapterV2TurnMessage,
    }),
  ),
  interruptInput: json(
    Schema.Struct({
      providerThread: Thread,
      providerTurnId: ProviderTurnId,
      requestRuntimeRestart: Schema.optionalKey(Schema.Boolean),
    }),
  ),
  runtimeRequestResponse: json(
    Schema.Struct({
      requestId: RuntimeRequestId,
      decision: Schema.optionalKey(ProviderApprovalDecision),
      answers: Schema.optionalKey(ProviderUserInputAnswers),
      response: Schema.optionalKey(Schema.Unknown),
    }),
  ),
  threadRef: json(Schema.Struct({ providerThread: Thread })),
  threadSnapshot: json(ThreadSnapshot),
  rollbackInput: json(
    Schema.Struct({ providerThread: Thread, target: RollbackTarget, providerThreadTurns: Turns }),
  ),
  forkInput: json(
    Schema.Struct({
      sourceProviderThread: Thread,
      sourceProviderTurns: Schema.optionalKey(Turns),
      providerTurnId: Schema.optionalKey(ProviderTurnId),
      targetThreadId: ThreadId,
      ownerNodeId: Schema.optionalKey(NodeId),
      modelSelection: Schema.optionalKey(ModelSelection),
      runtimePolicy: Schema.optionalKey(ProviderAdapterV2RuntimePolicy),
    }),
  ),
  jobControlInput: json(
    Schema.Struct({ providerThread: Thread, request: ProviderJobControlRequest }),
  ),
  jobControlResult: json(ProviderJobControlResult),
} as const;
