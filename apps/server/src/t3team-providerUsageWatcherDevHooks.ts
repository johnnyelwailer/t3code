/**
 * Dev hooks of the provider usage watcher (GHE #421), gated behind
 * `T3TEAM_PROVIDER_USAGE_DEV_FORCE=1`: `forceExhaust` holds one thread's
 * latest user message exactly as a usage-limited failure would, and
 * `forceRecover` releases every hold through the real replay path, so the
 * banner → toggle → auto-resume cycle can be verified live without burning a
 * real subscription window.
 *
 * @module t3team-providerUsageWatcherDevHooks
 */
import { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { releaseHold } from "./t3team-providerUsageWatcherActions.ts";
import { recordHold } from "./t3team-providerUsageWatcherFailures.ts";
import {
  ProviderUsageDevError,
  type ProviderUsageWatcherDeps,
  type ProviderUsageWatcherDevState,
} from "./t3team-providerUsageWatcherTypes.ts";

const disabled = () =>
  new ProviderUsageDevError({
    message: "Dev force hooks are disabled (set T3TEAM_PROVIDER_USAGE_DEV_FORCE=1 to enable).",
  });

export const forceExhaust = Effect.fn("providerUsageWatcher.forceExhaust")(function* (
  deps: ProviderUsageWatcherDeps,
  devForceEnabled: boolean,
  input: {
    readonly threadId: string;
    readonly providerInstanceId?: string;
    readonly resetsInMs?: number;
  },
) {
  if (!devForceEnabled) return yield* disabled();
  const thread = Option.getOrUndefined(
    yield* deps.query
      .getThreadDetailById(ThreadId.make(input.threadId))
      .pipe(Effect.orElseSucceed(() => Option.none())),
  );
  const lastUser = thread?.messages.findLast((message) => message.role === "user");
  const instanceId = input.providerInstanceId ?? thread?.session?.providerInstanceId ?? null;
  if (thread === undefined || lastUser === undefined || instanceId === null) {
    return yield* new ProviderUsageDevError({
      message:
        "forceExhaust needs a thread with a user message and a provider instance (session or providerInstanceId).",
    });
  }
  const resetsAt = DateTime.formatIso(
    DateTime.addDuration(yield* DateTime.now, Duration.millis(input.resetsInMs ?? 5 * 60_000)),
  );
  yield* recordHold(deps, {
    threadId: input.threadId,
    messageId: lastUser.id,
    providerInstanceId: instanceId,
    driver:
      deps.state.instances.get(instanceId)?.driver ?? thread.session?.providerName ?? "unknown",
    resetsAt,
  });
  return { resetsAt };
});

export const forceRecover = Effect.fn("providerUsageWatcher.forceRecover")(function* (
  deps: ProviderUsageWatcherDeps,
  devForceEnabled: boolean,
) {
  if (!devForceEnabled) return yield* disabled();
  let released = 0;
  for (const row of yield* deps.holds.listActive().pipe(Effect.orDie)) {
    if (yield* releaseHold(deps, row, { reason: "dev-force-recover", replay: true })) {
      released += 1;
    }
  }
  return { released };
});

export const getDevState = (
  deps: ProviderUsageWatcherDeps,
): Effect.Effect<ProviderUsageWatcherDevState> =>
  Effect.gen(function* () {
    return {
      instances: [...deps.state.instances].map(([instanceId, entry]) => ({ instanceId, ...entry })),
      holds: yield* deps.holds.listActive().pipe(Effect.orDie),
    };
  });
