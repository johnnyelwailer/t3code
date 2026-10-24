/**
 * delegate_task's `cloudSession` at preparation time: place the child on a cloud session
 * (`t3team-delegateTaskCloudSession.ts`) and route it there through the `remoteEnvironment`
 * instance (`t3team-remoteEnvironmentTarget.ts`), before the child exists.
 *
 * The child runs the project's own repository on the session's own checkout, so a project
 * without a repository and a delegated worktree are refused. A child that cannot be placed fails
 * the delegation with the reason; it never runs here instead. Placement runs once per request key
 * (`t3team-delegateCloudReplay.ts`): a retried delegation gets the same session and note and
 * reserves nothing again. The capacity slot reserved while placing is handed to the child once it
 * exists (`register`, which also records the child in the server's placement registry that the
 * `remoteEnvironment` driver trusts) or freed when no child was created (`release`).
 * No `ThreadEnvironmentBinding` is recorded: its contract says messages and completion wakes do
 * not reach a bound child, which is false for this stand-in.
 */
import {
  type ModelSelection,
  type OrchestrationProjectShell,
  type OrchestratorMcpDelegateWorkspace,
  OrchestratorMcpFailure,
  repositoryGroupingKeyOf,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  type DelegateCloudSessions,
  placeOnCloudSession,
} from "./t3team-delegateTaskCloudSession.ts";
import { placementNote } from "./t3team-delegateTaskCloudPlacementNote.ts";
import type { CloudSessionRequest } from "./t3team-delegateTaskCloudSessionExtension.ts";
import { remoteEnvironmentModelSelection } from "./t3team-remoteEnvironmentTarget.ts";
import type { CloudChildPlacementRecord } from "./t3team-delegateCloudReplay.ts";

const invalid = (message: string) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message });

export interface CloudChildPrepared {
  readonly modelSelection: ModelSelection;
  readonly note: string;
  readonly register: (childThreadId: ThreadId) => Effect.Effect<void>;
  readonly release: Effect.Effect<void>;
}

export const prepareCloudChild = Effect.fn("delegateTask.cloudSession.prepare")(function* (input: {
  readonly sessions: DelegateCloudSessions;
  readonly request: CloudSessionRequest;
  readonly project: OrchestrationProjectShell | undefined;
  readonly workspace: OrchestratorMcpDelegateWorkspace | undefined;
  readonly requestKey: string;
  readonly modelSelection: ModelSelection;
}) {
  if (input.workspace?.isolation === "worktree") {
    return yield* invalid(
      "cloudSession runs the child on the cloud session's own checkout; omit workspace isolation.",
    );
  }
  const identity = input.project?.repositoryIdentity;
  if (input.project === undefined || identity === undefined || identity === null) {
    return yield* invalid(
      "cloudSession needs a project with a repository: a cloud session runs the project's own repository.",
    );
  }
  const repositoryKey = repositoryGroupingKeyOf(identity);
  const { sessions, requestKey } = input;
  const projectId = input.project.id;
  const placed = yield* sessions.replays.once(
    requestKey,
    Effect.gen(function* () {
      const placement = yield* placeOnCloudSession(sessions, {
        request: input.request,
        requestKey,
        projectId,
        repositoryName: identity.name ?? repositoryKey.split("/").pop() ?? repositoryKey,
        repositoryKey,
        modelSelection: input.modelSelection,
      });
      if (placement.kind === "unplaced") {
        return yield* invalid(`No cloud session can take this child: ${placement.reason}`);
      }
      return {
        sessionId: placement.session.sessionId,
        repositoryKey,
        modelSelection: remoteEnvironmentModelSelection({
          sessionId: placement.session.sessionId,
          modelSelection: input.modelSelection,
        }),
        note: placementNote(placement, input.modelSelection),
      } satisfies CloudChildPlacementRecord;
    }),
  );
  const { record } = placed;
  return {
    modelSelection: record.modelSelection,
    note: record.note,
    register: (childThreadId) =>
      Effect.all([
        sessions.capacity.register(requestKey, childThreadId),
        sessions.placements.register(childThreadId, {
          sessionId: record.sessionId,
          repositoryKey: record.repositoryKey,
        }),
      ]).pipe(Effect.asVoid),
    release: placed.fresh
      ? Effect.all([
          sessions.capacity.release(requestKey),
          sessions.replays.forget(requestKey),
        ]).pipe(Effect.asVoid)
      : Effect.void,
  } satisfies CloudChildPrepared;
});
