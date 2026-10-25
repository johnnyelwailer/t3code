/**
 * The checks and verdicts around one turn's connection to the cloud session
 * (`t3team-remoteEnvironmentFollow.ts`): the pre-flight that the session's own project is the
 * child's repository and offers the requested model (a mismatch rejects the turn; nothing is
 * substituted), creating the remote thread, which failures are worth a reconnect, and how a
 * failure reads as a turn terminal.
 *
 * The own-project check is strict: the repository key is derived on this server
 * (`t3team-remoteEnvironmentAuthorize.ts`), and an own project with no repository identity is
 * refused rather than accepted. A provider that lists no models accepts any model name: such a
 * provider (a custom endpoint) cannot be checked here, and its own turn fails if the name is wrong.
 */
import { type CloudSessionFailedError, repositoryGroupingKeyOf } from "@t3tools/contracts";
import type { ProviderAdapterV2TurnInput } from "@t3tools/provider-core/server/ProviderAdapter";
import { ownProjectOnMachine, projectCwdOf } from "@t3tools/shared/t3team-cloudSessionFit";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type {
  RemoteEnvironmentApi,
  RemoteEnvironmentError,
  RemoteThreadView,
} from "./t3team-remoteEnvironmentApiTypes.ts";
import type { RemoteEnvironmentGrant } from "./t3team-remoteEnvironmentApiTypes.ts";
import type { RemoteTurnTerminal } from "./t3team-remoteEnvironmentTurn.ts";

export class RemoteEnvironmentRejected extends Schema.TaggedError<RemoteEnvironmentRejected>()(
  "RemoteEnvironmentRejected",
  {
    reason: Schema.Literals(["placement", "project", "model", "attachments"]),
    message: Schema.String,
  },
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

/**
 * The session's own project, after checking it is the child's repository and that the requested
 * provider and model exist there. Used when a delegation names a ready session and on a turn.
 */
export const checkRemoteTarget = Effect.fn("remoteEnvironment.checkTarget")(function* (
  api: RemoteEnvironmentApi,
  target: Pick<RemoteEnvironmentGrant, "repositoryKey" | "modelSelection">,
) {
  const config = yield* api.serverConfig;
  const cwd = projectCwdOf(config);
  const own = cwd === null ? undefined : ownProjectOnMachine(cwd, yield* api.projects);
  const ownKey = own?.repositoryIdentity ? repositoryGroupingKeyOf(own.repositoryIdentity) : null;
  if (own === undefined || ownKey !== target.repositoryKey) {
    return yield* new RemoteEnvironmentRejected({
      reason: "project",
      message:
        own !== undefined && ownKey === null
          ? `The cloud session's own project has no repository identity, so it cannot be confirmed as ${target.repositoryKey}; the child does not run there.`
          : `The cloud session's own project is not ${target.repositoryKey}, so the child cannot run there.`,
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
      reason: "model",
      message: `Model '${model}' of provider '${instanceId}' is not available on the cloud session. It offers: ${available || "nothing"}.`,
    });
  }
  return own;
});

/**
 * Creates the remote thread under the local thread's id unless it exists already (a later turn, a
 * retry after a dropped connection, a restart). `launchThread` with `reuseExistingThread` requires
 * the thread to exist, so the first launch goes without it.
 */
const ensureRemoteThread = Effect.fn("remoteEnvironment.ensureThread")(function* (
  api: RemoteEnvironmentApi,
  input: Omit<
    Parameters<RemoteEnvironmentApi["launchThread"]>[0],
    "reuseExistingThread" | "workspaceStrategy"
  >,
) {
  const threadId = input.threadId;
  const exists =
    threadId === undefined
      ? false
      : yield* api.projection(threadId).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
  if (exists) return;
  yield* api.launchThread({ ...input, workspaceStrategy: { type: "root" } });
});

export const prepareRemoteThread = Effect.fn("remoteEnvironment.prepareThread")(function* (
  api: RemoteEnvironmentApi,
  turn: ProviderAdapterV2TurnInput,
  grant: RemoteEnvironmentGrant,
) {
  const own = yield* checkRemoteTarget(api, grant);
  yield* ensureRemoteThread(api, {
    threadId: turn.threadId,
    projectId: own.id,
    title: turn.appThread.title,
    modelSelection: grant.modelSelection,
    runtimeMode: turn.runtimePolicy.runtimeMode,
    interactionMode: turn.runtimePolicy.interactionMode,
  });
});

export const pendingApproval = (projection: RemoteThreadView, runId: string | null) =>
  runId !== null &&
  projection.runtimeRequests.some((request) => request.status === "pending") &&
  projection.runs.some((run) => run.id === runId && run.status === "waiting");
