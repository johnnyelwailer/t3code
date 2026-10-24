/**
 * Feeds the thread's "Setting up your cloud session" card (`t3team-CloudSessionSetupCard`) for a
 * draft thread. Two sources, one card:
 *  - the draft's first message is waiting for its session (`gate.card`): the card shows the whole
 *    path, including connecting and sending, with Cancel / Retry for the message;
 *  - the draft only has a Run-on cloud target: the card shows the session becoming ready, and
 *    nothing more, because nothing in this app asks for the machine until a message is sent.
 * Null when there is nothing to say: no target, not a draft, the session list has not answered yet
 * (an old draft must not flash a waiting card), or a session that was stopped or cancelled (the
 * Run-on menu and the ended-session banner own those).
 */
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { useEnvironments } from "~/state/environments";
import type { CloudSessionSetupCardProps } from "./t3team-CloudSessionSetupCard";
import { cloudSetupRecovery } from "./t3team-cloudSessionSetupProgress";
import { beginCloudSessionCreate, useCloudSessionTarget } from "./t3team-cloudSessionTargetStore";
import type { CloudQueuedSendCardInput } from "./t3team-cloudSessionSetupModel";
import type { useCloudSessionController } from "./t3team-useCloudSessionController";
import { useCloudSessionProjectKey } from "./t3team-useCloudSessionProjectFollow";

/** What the setup card reads from the composer gate's session controller, and nothing more. */
export type CloudSetupSessionSource = Pick<
  ReturnType<typeof useCloudSessionController>,
  "sessions" | "loading" | "onCreate" | "primaryEnvironmentId"
>;

/** How long a session may stay out of the list before the card says it has no status for it. */
export const CLOUD_SETUP_LOST_AFTER_MS = 90_000;

/** True once `sessionId` has been missing for `CLOUD_SETUP_LOST_AFTER_MS`; one timer, no ticking. */
export function useCloudSessionLost(sessionId: string | null, missing: boolean): boolean {
  const [lostId, setLostId] = useState<string | null>(null);
  if (!missing && lostId !== null) setLostId(null);
  useEffect(() => {
    if (!missing || sessionId === null) return;
    const id = setTimeout(() => setLostId(sessionId), CLOUD_SETUP_LOST_AFTER_MS);
    return () => clearTimeout(id);
  }, [missing, sessionId]);
  return missing && sessionId !== null && lostId === sessionId;
}

export function useCloudSessionSetupCard(input: {
  readonly draftId: string | null;
  readonly scopeKey: string | null;
  readonly projectRef: ScopedProjectRef | null;
  readonly gate: {
    readonly card: CloudQueuedSendCardInput | null;
    readonly cloud: CloudSetupSessionSource;
  };
}): CloudSessionSetupCardProps | null {
  const { draftId, scopeKey, projectRef, gate } = input;
  const { cloud } = gate;
  const target = useCloudSessionTarget(draftId === null ? null : scopeKey);
  const projectKey = useCloudSessionProjectKey(projectRef);
  const { environments } = useEnvironments();
  const { onCreate, primaryEnvironmentId } = cloud;
  const projectId =
    projectRef !== null && projectRef.environmentId === primaryEnvironmentId
      ? projectRef.projectId
      : undefined;
  const tryAgain = () =>
    beginCloudSessionCreate({ scopeKey, projectKey }, undefined, () => onCreate(projectId));
  const queued = draftId === null ? null : gate.card;
  const sessionId =
    draftId === null ? null : (queued?.facts.queued.sessionId ?? target?.sessionId ?? null);
  const session =
    sessionId === null
      ? null
      : (cloud.sessions.find((item) => item.sessionId === sessionId) ?? null);
  const lost = useCloudSessionLost(
    sessionId,
    !cloud.loading && sessionId !== null && session === null,
  );

  if (sessionId === null) return null;
  if (queued === null && cloud.loading) return null;
  if (queued === null && (session?.phase === "stopped" || session?.phase === "cancelled")) {
    return null;
  }
  const recovery = cloudSetupRecovery({
    session,
    lost,
    hasQueued: queued !== null,
    canRetry: queued?.onRetry != null,
  });
  const machineConnected =
    queued?.facts.machineConnected ??
    environments.some(
      (environment) =>
        environment.environmentId === session?.environmentId &&
        environment.connection.phase === "connected",
    );
  return {
    facts: {
      session,
      machineConnected,
      projectReady: queued?.facts.projectReady ?? false,
      projectWait: queued?.facts.projectWait ?? null,
      queued: queued?.facts.queued,
      delivery: queued === null ? "none" : queued.facts.flushing ? "sending" : "queued",
      sendFailure: queued?.facts.queued.failureMessage ?? null,
      lost,
    },
    onCancel: queued?.onCancel,
    onRetry: recovery.retry ? (queued?.onRetry ?? null) : null,
    onTryAgain: recovery.tryAgain ? tryAgain : null,
    sending: queued?.facts.flushing ?? false,
  };
}
