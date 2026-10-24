/**
 * The shapes delegate_task's cloud placement works with (`t3team-delegateTaskCloudSession.ts`):
 * what it needs from cloud sessions, what it is asked, and what it answers.
 */
import type {
  CloudSession,
  CloudSessionFailedError,
  CloudSessionListResult,
  ModelSelection,
  ProjectId,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";

import type { CloudSessionCapacity } from "./t3team-delegateCloudCapacity.ts";
import type { CloudSessionStartGuard } from "./t3team-delegateTaskCloudSessionStartGuard.ts";
import type { CloudSessionRequest } from "./t3team-delegateTaskCloudSessionExtension.ts";
import type { RemoteEnvironmentError } from "./t3team-remoteEnvironmentApiTypes.ts";
import type { RemoteEnvironmentRejected } from "./t3team-remoteEnvironmentPrepare.ts";

type ProbeError = RemoteEnvironmentRejected | RemoteEnvironmentError | CloudSessionFailedError;

export interface DelegateCloudSessions {
  readonly list: Effect.Effect<CloudSessionListResult, CloudSessionFailedError>;
  /** Fails with the broker's reason when this server cannot reach it (signed out, no broker). */
  readonly brokerReady: Effect.Effect<void, CloudSessionFailedError>;
  /** Starts a session for a project and returns it once its run is listed. */
  readonly start: (projectId: ProjectId) => Effect.Effect<CloudSession, CloudSessionFailedError>;
  /** Attaches to a ready session and checks its own project and the requested model. */
  readonly probe: (
    sessionId: string,
    target: { readonly repositoryKey: string; readonly modelSelection: ModelSelection },
  ) => Effect.Effect<void, ProbeError>;
  readonly startGuard: CloudSessionStartGuard;
  readonly capacity: CloudSessionCapacity;
}

export interface CloudSessionPlacementInput {
  readonly request: CloudSessionRequest;
  readonly projectId: ProjectId;
  readonly repositoryName: string;
  /** `repositoryGroupingKeyOf` of the project's repository. */
  readonly repositoryKey: string;
  readonly modelSelection: ModelSelection;
}

export type CloudSessionPlacement =
  | {
      readonly kind: "placed";
      readonly session: CloudSession;
      readonly ready: boolean;
      readonly started: boolean;
    }
  | { readonly kind: "unplaced"; readonly reason: string };
