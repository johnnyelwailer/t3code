/**
 * The checks and verdicts around one turn's connection to the cloud session
 * (`t3team-remoteEnvironmentFollow.ts`): the pre-flight that the session's own project is the
 * child's repository and offers the requested model (a mismatch rejects the turn; nothing is
 * substituted), which failures are worth a reconnect, and how a failure reads as a turn terminal.
 */
import type { CloudSessionFailedError } from "@t3tools/contracts";
import type { ProviderAdapterV2TurnInput } from "@t3tools/provider-core/server/ProviderAdapter";
import {
  isOwnProjectOfRepository,
  ownProjectOnMachine,
  projectCwdOf,
} from "@t3tools/shared/t3team-cloudSessionFit";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type {
  RemoteEnvironmentApi,
  RemoteEnvironmentError,
  RemoteThreadView,
} from "./t3team-remoteEnvironmentApiTypes.ts";
import type { RemoteEnvironmentTarget } from "./t3team-remoteEnvironmentTarget.ts";
import type { RemoteTurnTerminal } from "./t3team-remoteEnvironmentTurn.ts";

export class RemoteEnvironmentRejected extends Schema.TaggedError<RemoteEnvironmentRejected>()(
  "RemoteEnvironmentRejected",
  { message: Schema.String },
) {}

export const retryable = (
  error: RemoteEnvironmentError | CloudSessionFailedError | RemoteEnvironmentRejected,
) =>
  error._tag === "RemoteEnvironmentError" ||
  (error._tag === "CloudSessionFailedError" &&
    (error.reason === "unknown_session" || error.reason === "broker_unavailable"));

export const terminalFor = (
  error: RemoteEnvironmentError | CloudSessionFailedError | RemoteEnvironmentRejected,
): RemoteTurnTerminal => ({
  status: "failed",
  message:
    error._tag === "RemoteEnvironmentRejected"
      ? error.message
      : error._tag === "CloudSessionFailedError" && error.reason === "session_ended"
        ? "The cloud session ended before the child finished."
        : `Lost the connection to the cloud session: ${error.message}`,
});

/** Checks the session's own project and the requested model, then creates the remote thread. */
export const prepareRemoteThread = Effect.fn("remoteEnvironment.prepareThread")(function* (
  api: RemoteEnvironmentApi,
  turn: ProviderAdapterV2TurnInput,
  target: RemoteEnvironmentTarget,
) {
  const config = yield* api.serverConfig;
  const cwd = projectCwdOf(config);
  const own = cwd === null ? undefined : ownProjectOnMachine(cwd, yield* api.projects);
  if (own === undefined || !isOwnProjectOfRepository(target.repositoryKey, own)) {
    return yield* new RemoteEnvironmentRejected({
      message: `The cloud session's own project is not ${target.repositoryKey}, so the child cannot run there.`,
    });
  }
  const { instanceId, model } = target.modelSelection;
  const provider = config.providers.find((candidate) => candidate.instanceId === instanceId);
  const offered = provider?.models.map((candidate) => candidate.slug) ?? [];
  if (
    provider === undefined ||
    !provider.enabled ||
    (offered.length > 0 && !offered.includes(model))
  ) {
    const available = config.providers
      .filter((candidate) => candidate.enabled)
      .map(
        (candidate) =>
          `${candidate.instanceId} (${candidate.models.map((m) => m.slug).join(", ")})`,
      )
      .join("; ");
    return yield* new RemoteEnvironmentRejected({
      message: `Model '${model}' of provider '${instanceId}' is not available on the cloud session. It offers: ${available || "nothing"}.`,
    });
  }
  yield* api.launchThread({
    threadId: turn.threadId,
    reuseExistingThread: true,
    projectId: own.id,
    title: turn.appThread.title,
    modelSelection: target.modelSelection,
    runtimeMode: turn.runtimePolicy.runtimeMode,
    interactionMode: turn.runtimePolicy.interactionMode,
    workspaceStrategy: { type: "root" },
  });
});

export const pendingApproval = (projection: RemoteThreadView, runId: string | null) =>
  runId !== null &&
  projection.runtimeRequests.some((request) => request.status === "pending") &&
  projection.runs.some((run) => run.id === runId && run.status === "waiting");
