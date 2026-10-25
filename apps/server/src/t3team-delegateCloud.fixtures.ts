/**
 * A fake of delegate_task's cloud placement dependencies (`DelegateCloudSessions`) for the
 * placement, preparation and hook tests: a listed session set, a counting `start`, a scriptable
 * probe, and the real start guard, capacity, placement registry (over in-memory markers) and replay
 * store.
 */
import {
  type CloudSession,
  CloudSessionFailedError,
  ProjectId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import { makeCloudSessionCapacity } from "./t3team-delegateCloudCapacity.ts";
import { makeCloudPlacementReplays } from "./t3team-delegateCloudReplay.ts";
import { makeCloudSessionStartGuard } from "./t3team-delegateTaskCloudSessionStartGuard.ts";
import type {
  CloudSessionPlacementInput,
  DelegateCloudSessions,
} from "./t3team-delegateTaskCloudTypes.ts";
import {
  type CloudChildPlacementMarkers,
  makeMemoryCloudChildPlacementMarkers,
} from "./t3team-cloudChildPlacementMarkers.ts";
import { makeRemoteEnvironmentPlacements } from "./t3team-remoteEnvironmentPlacements.ts";

const PROJECT_ID = ProjectId.make("project:qa");
export const REPOSITORY_KEY = "nexplore.ghe.com/pj/nexi-machine-qa";
export const MODEL = { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" };

export const cloudSession = (overrides: Partial<CloudSession>): CloudSession => ({
  sessionId: "41",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 60,
  name: "nexi-machine-qa",
  remainingSeconds: 4 * 3600,
  machineLabel: "ubuntu",
  failureReason: null,
  detailsUrl: null,
  environmentId: "env-41",
  transport: "nexi_broker",
  ...overrides,
});

export const signedOut = new CloudSessionFailedError({
  reason: "broker_sign_in_required",
  message: "Sign in to Nexplore.",
});

export const autoInput = (requestKey = "request-1"): CloudSessionPlacementInput => ({
  request: { kind: "auto" },
  requestKey,
  projectId: PROJECT_ID,
  repositoryName: "nexi-machine-qa",
  repositoryKey: REPOSITORY_KEY,
  modelSelection: MODEL,
});

export const fakeCloudSessions = Effect.fn("fakeCloudSessions")(function* (input: {
  readonly sessions?: ReadonlyArray<CloudSession>;
  readonly configured?: boolean;
  readonly brokerReady?: Effect.Effect<void, CloudSessionFailedError>;
  readonly list?: DelegateCloudSessions["list"];
  readonly probe?: DelegateCloudSessions["probe"];
  readonly started?: CloudSession;
  readonly limit?: number;
  readonly active?: ReadonlyArray<string>;
  /** Shared across two fakes, they stand for one server before and after a restart. */
  readonly markers?: CloudChildPlacementMarkers;
}) {
  const starts = yield* Ref.make(0);
  const sessions: DelegateCloudSessions = {
    list:
      input.list ??
      Effect.succeed({ sessions: input.sessions ?? [], configured: input.configured ?? true }),
    brokerReady: input.brokerReady ?? Effect.void,
    start: () =>
      Ref.update(starts, (count) => count + 1).pipe(
        Effect.as(input.started ?? cloudSession({ sessionId: "99", phase: "requested" })),
      ),
    probe: input.probe ?? (() => Effect.void),
    startGuard: yield* makeCloudSessionStartGuard(),
    capacity: yield* makeCloudSessionCapacity({
      limit: input.limit ?? 3,
      isActive: (threadId) => Effect.succeed((input.active ?? []).includes(threadId)),
    }),
    placements: yield* makeRemoteEnvironmentPlacements(
      input.markers ?? (yield* makeMemoryCloudChildPlacementMarkers),
    ),
    replays: yield* makeCloudPlacementReplays,
  };
  return { sessions, starts };
});
