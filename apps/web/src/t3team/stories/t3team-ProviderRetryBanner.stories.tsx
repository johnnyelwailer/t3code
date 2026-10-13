import type { Meta, StoryObj } from "@storybook/react";
import {
  EnvironmentId,
  MessageId,
  NodeId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2RunStatus,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2TransientRecovery,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { useMemo, useState } from "react";

import { ComposerBannerStack } from "~/components/chat/ComposerBannerStack";
import { useProviderRetryBannerItem } from "~/components/chat/t3team-ProviderRetryBanner";

// The real hook and the real composer stack, fed the thread projection shape the server streams:
// a run, its root `error` turn item (with `retry` progress while the provider retries in-turn),
// and the host-armed `thread.transientRecovery` once the run failed.
const threadId = ThreadId.make("thread-retry-story");
const instanceId = ProviderInstanceId.make("codex");
const runId = RunId.make("run-retry-story");
const gatewayTimeout = {
  class: "transport_error",
  message: "Gateway timeout (504) from api.openai.com — upstream did not answer within 60s",
  code: "504",
  retryable: true,
} as const;

function projection(input: {
  readonly status: OrchestrationV2RunStatus;
  readonly nowMs: number;
  readonly retry?: { readonly attempt: number; readonly retryDelayMs: number };
  readonly recovery?: Omit<OrchestrationV2TransientRecovery, "runId">;
}): OrchestrationV2ThreadProjection {
  const now = DateTime.makeUnsafe(input.nowMs);
  const started = DateTime.makeUnsafe(input.nowMs - 95_000);
  const failed = input.status === "failed";
  const run = {
    id: runId,
    threadId,
    ordinal: 3,
    providerInstanceId: instanceId,
    modelSelection: { instanceId, model: "gpt-5.4" },
    providerThreadId: null,
    userMessageId: MessageId.make("message-retry-story"),
    rootNodeId: NodeId.make("root-retry-story"),
    activeAttemptId: null,
    status: input.status,
    requestedAt: started,
    startedAt: started,
    completedAt: failed ? now : null,
    checkpointId: null,
    contextHandoffId: null,
  };
  const errorItem = {
    id: TurnItemId.make("error-retry-story"),
    threadId,
    runId,
    nodeId: run.rootNodeId,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 4,
    type: "error" as const,
    status: failed ? ("failed" as const) : ("running" as const),
    title: null,
    startedAt: started,
    completedAt: failed ? now : null,
    updatedAt: now,
    failure: gatewayTimeout,
    ...(input.retry ? { retry: { ...input.retry, maxAttempts: 5 } } : {}),
  };
  return {
    thread: {
      id: threadId,
      providerInstanceId: instanceId,
      transientRecovery: input.recovery ? { runId, ...input.recovery } : null,
    },
    providerSessions: [],
    runs: [run],
    turnItems: [errorItem],
  } as unknown as OrchestrationV2ThreadProjection;
}

type Fixture = Parameters<typeof projection>[0];

function RetryBannerInComposer(props: { readonly fixture: (nowMs: number) => Fixture }) {
  // Fixtures are relative to mount time, so the countdowns read like a live thread.
  const [nowMs] = useState(() => Date.now());
  const serverProjection = useMemo(() => projection(props.fixture(nowMs)), [props.fixture, nowMs]);
  const item = useProviderRetryBannerItem({
    enabled: true,
    environmentId: EnvironmentId.make("environment-retry-story"),
    threadId,
    projection: serverProjection,
  });
  return (
    <div className="mx-auto w-full max-w-3xl pt-16">
      <ComposerBannerStack items={item === null ? [] : [item]} />
      <div className="rounded-b-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Ask anything…
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Composer/Provider Retry Banner",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** The provider is retrying inside the turn: attempt 2 of 5, next try in 8s. */
export const RetryingInTurn: Story = {
  render: () => (
    <RetryBannerInComposer
      fixture={(nowMs) => ({
        status: "running",
        nowMs,
        retry: { attempt: 2, retryDelayMs: 8_000 },
      })}
    />
  ),
};

/** Retries exhausted, the run failed; auto-resume is armed and counts down to the next try. */
export const FailedAutoResumeOn: Story = {
  render: () => (
    <RetryBannerInComposer
      fixture={(nowMs) => ({
        status: "failed",
        nowMs,
        recovery: { nextTryAt: new Date(nowMs + 4 * 60_000).toISOString(), autoResume: true },
      })}
    />
  ),
};

/** Same failure after the user cancelled auto-resume: no countdown, the toggle re-arms it. */
export const FailedAutoResumeOff: Story = {
  render: () => (
    <RetryBannerInComposer
      fixture={(nowMs) => ({
        status: "failed",
        nowMs,
        recovery: { nextTryAt: null, autoResume: false },
      })}
    />
  ),
};
