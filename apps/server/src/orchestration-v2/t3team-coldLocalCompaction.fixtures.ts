import {
  MessageId,
  NodeId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  ProviderThreadId,
  ProviderTurnId,
  RunAttemptId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2Run,
  type OrchestrationV2RunAttempt,
  type OrchestrationV2ProviderTurn,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import type { ColdLocalCompactionRouteDefinition } from "@t3team/pack-api";
import * as DateTime from "effect/DateTime";

const at = DateTime.makeUnsafe("2026-10-13T08:00:00.000Z");

export const threadId = ThreadId.make("thread:cold-compaction");
export const claudeDriver = ProviderDriverKind.make("claudeAgent");
export const claudeInstanceId = ProviderInstanceId.make("claudeAgent");
export const providerThreadId = ProviderThreadId.make("provider-thread:cold-compaction");
export const rootNodeId = NodeId.make("node:cold-compaction");

export const isoAt = (epochMs: number): string => DateTime.formatIso(DateTime.makeUnsafe(epochMs));

export const COLD_NOW = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-10-13T09:00:00.000Z"));
export const COLD_REPORTED_AT = "2026-10-13T08:00:00.000Z";
export const WARM_REPORTED_AT = "2026-10-13T08:58:00.000Z";

export const route: ColdLocalCompactionRouteDefinition = {
  driver: "claudeAgent",
  ttlMs: 5 * 60 * 1000,
  minUsedTokens: 100_000,
  localProviderInstance: "nexplore",
  localModel: "medium",
  enabled: true,
};

export const nativeThread: OrchestrationV2ProviderThread = {
  id: providerThreadId,
  driver: claudeDriver,
  providerInstanceId: claudeInstanceId,
  providerSessionId: ProviderSessionId.make("provider-session:cold-compaction"),
  appThreadId: threadId,
  ownerNodeId: null,
  nativeThreadRef: { driver: claudeDriver, nativeId: "native-session-1", strength: "strong" },
  nativeConversationHeadRef: null,
  status: "idle",
  firstRunOrdinal: 1,
  lastRunOrdinal: 2,
  handoffIds: [],
  forkedFrom: null,
  createdAt: at,
  updatedAt: at,
};

const makeRun = (
  ordinal: number,
  status: OrchestrationV2Run["status"],
  id: string,
): OrchestrationV2Run => ({
  id: RunId.make(id),
  threadId,
  ordinal,
  providerInstanceId: claudeInstanceId,
  modelSelection: { instanceId: claudeInstanceId, model: "claude-opus-4-6" },
  providerThreadId,
  userMessageId: MessageId.make(`message:${id}`),
  rootNodeId,
  activeAttemptId: null,
  status,
  requestedAt: at,
  startedAt: at,
  completedAt: status === "completed" ? at : null,
  checkpointId: null,
  contextHandoffId: null,
});

export const previousRun = makeRun(2, "completed", "run:previous");
export const compactionRun = makeRun(3, "starting", "run:compaction");

const attempt: OrchestrationV2RunAttempt = {
  id: RunAttemptId.make("attempt:previous"),
  nativeThreadId: "native-session-1",
  runId: previousRun.id,
  attemptOrdinal: 1,
  rootNodeId,
  providerInstanceId: claudeInstanceId,
  providerThreadId,
  providerTurnId: null,
  reason: "initial",
  status: "completed",
  startedAt: at,
  completedAt: at,
};

const providerTurn = (usedTokens: number, reportedAt: string): OrchestrationV2ProviderTurn => ({
  id: ProviderTurnId.make("provider-turn:previous"),
  providerThreadId,
  nodeId: rootNodeId,
  runAttemptId: attempt.id,
  nativeTurnRef: null,
  ordinal: 1,
  status: "completed",
  startedAt: at,
  completedAt: at,
  tokenUsage: { usedTokens, updatedAt: reportedAt },
});

export const projectionWithUsage = (
  usedTokens: number,
  reportedAt: string,
  runs: ReadonlyArray<OrchestrationV2Run> = [previousRun, compactionRun],
): Pick<OrchestrationV2ThreadProjection, "providerTurns" | "attempts" | "runs"> => ({
  runs,
  attempts: [attempt],
  providerTurns: [providerTurn(usedTokens, reportedAt)],
});

export const conversationItems: ReadonlyArray<OrchestrationV2TurnItem> = [
  { text: "Rename the exporter", role: "user" },
  { text: "Renamed it and updated the callers.", role: "assistant" },
].map(({ text, role }, ordinal): OrchestrationV2TurnItem => ({
  id: TurnItemId.make(`turn-item:${ordinal}`),
  threadId,
  runId: previousRun.id,
  nodeId: rootNodeId,
  providerThreadId,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal,
  status: "completed",
  title: null,
  startedAt: at,
  completedAt: at,
  updatedAt: at,
  messageId: MessageId.make(`message:${ordinal}`),
  text,
  ...(role === "user"
    ? {
        type: "user_message" as const,
        inputIntent: "turn_start" as const,
        attachments: [],
        createdBy: "user" as const,
        creationSource: "web" as const,
      }
    : { type: "assistant_message" as const, streaming: false }),
}));
