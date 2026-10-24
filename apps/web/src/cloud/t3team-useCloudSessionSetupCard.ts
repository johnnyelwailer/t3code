/**
 * Feeds the thread's "Setting up your cloud session" card (`t3team-CloudSessionSetupCard`) for a
 * draft thread. Two sources, one card:
 *  - the draft's first message is waiting for its session (`gate.card`): the card shows the whole
 *    path, including connecting and sending, with Cancel / Retry for the message;
 *  - the draft only has a Run-on cloud target: the card shows the session becoming ready, and
 *    nothing more, because nothing in this app asks for the machine until a message is sent.
 * Null when there is nothing to say: no target, not a draft, or a session that was stopped or
 * cancelled (the Run-on menu and the ended-session banner own those).
 */
import type { ScopedProjectRef } from "@t3tools/contracts";

import type { CloudSessionSetupCardProps } from "./t3team-CloudSessionSetupCard";
import { beginCloudSessionCreate, useCloudSessionTarget } from "./t3team-cloudSessionTargetStore";
import type { useCloudSessionComposerGate } from "./t3team-useCloudSessionComposerGate";
import { useCloudSessionProjectKey } from "./t3team-useCloudSessionProjectFollow";

export function useCloudSessionSetupCard(input: {
  readonly draftId: string | null;
  readonly scopeKey: string | null;
  readonly projectRef: ScopedProjectRef | null;
  readonly gate: ReturnType<typeof useCloudSessionComposerGate>;
}): CloudSessionSetupCardProps | null {
  const { draftId, scopeKey, projectRef, gate } = input;
  const { cloud } = gate;
  const target = useCloudSessionTarget(draftId === null ? null : scopeKey);
  const projectKey = useCloudSessionProjectKey(projectRef);
  const { onCreate, primaryEnvironmentId } = cloud;
  const projectId =
    projectRef !== null && projectRef.environmentId === primaryEnvironmentId
      ? projectRef.projectId
      : undefined;
  const tryAgain = () =>
    beginCloudSessionCreate({ scopeKey, projectKey }, undefined, () => onCreate(projectId));

  if (draftId === null) return null;
  const queued = gate.card;
  const sessionId = queued?.facts.queued.sessionId ?? target?.sessionId ?? null;
  if (sessionId === null) return null;
  const session = cloud.sessions.find((item) => item.sessionId === sessionId) ?? null;
  if (queued === null && (session?.phase === "stopped" || session?.phase === "cancelled")) {
    return null;
  }
  const retryable = session?.phase === "failed" || (queued !== null && queued.onRetry === null);
  return {
    facts: {
      session,
      machineConnected: queued?.facts.machineConnected ?? false,
      projectReady: queued?.facts.projectReady ?? false,
      queued: queued?.facts.queued,
      delivery: queued === null ? "none" : queued.facts.flushing ? "sending" : "queued",
      sendFailure: queued?.facts.queued.failureMessage ?? null,
    },
    onCancel: queued?.onCancel,
    onRetry: queued?.onRetry ?? null,
    onTryAgain: retryable ? tryAgain : null,
    sending: queued?.facts.flushing ?? false,
  };
}
