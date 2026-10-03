/**
 * Host turn-inactivity budget (GHE #113/#306) consulted by `RunExecutionServiceV2`.
 *
 * A provider that stays connected but goes silent never ends its turn on its own: V2 only
 * settles a run when the provider stream fails or ends. The run watchdog
 * (`t3team-turnInactivityWatchdog.ts`) aborts such a turn once no provider activity arrived for
 * the instance's budget.
 *
 * The reference defaults to "disabled" so code that builds the V2 runtime without the server
 * wiring (tests, other hosts) keeps upstream behaviour; `server.ts` provides
 * `turnInactivityPolicyLive`, which reads `ProviderInstance.turnInactivityTimeoutSeconds` and
 * falls back to `DEFAULT_TURN_INACTIVITY_TIMEOUT_MS`.
 *
 * @module t3team-turnInactivityPolicy
 */
import type { ProviderInstanceId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProviderInstanceRegistry from "../provider/Services/ProviderInstanceRegistry.ts";
import type { ProviderAdapterV2Event } from "./ProviderAdapter.ts";

export const DEFAULT_TURN_INACTIVITY_TIMEOUT_MS = 600_000;
/** A Stop (or the watchdog's own interrupt) must produce a terminal within this window. */
export const INTERRUPT_SETTLE_GRACE_MS = 30_000;
/** An announced retry backoff arms `max(budget, delay + slack)`: the sleep plus the next request. */
const RETRY_ANNOUNCE_SLACK_MS = 120_000;
/** So a buggy announcement cannot disable the backstop indefinitely. */
const MAX_RETRY_ANNOUNCE_BUDGET_MS = 24 * 60 * 60 * 1000;

export interface TurnInactivityPolicyShape {
  /** Base inactivity budget for a run on this instance; `null` disables the watchdog. */
  readonly budgetMs: (instanceId: ProviderInstanceId) => Effect.Effect<number | null>;
}

export class TurnInactivityPolicy extends Context.Reference<TurnInactivityPolicyShape>(
  "t3team/orchestration-v2/TurnInactivityPolicy",
  { defaultValue: () => ({ budgetMs: () => Effect.succeed(null) }) },
) {}

export const budgetFromSeconds = (seconds: number | undefined): number =>
  typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? Math.round(seconds * 1000)
    : DEFAULT_TURN_INACTIVITY_TIMEOUT_MS;

export const turnInactivityPolicyLive = Layer.effect(
  TurnInactivityPolicy,
  Effect.gen(function* () {
    const instances = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
    return {
      budgetMs: (instanceId) =>
        instances
          .getInstance(instanceId)
          .pipe(
            Effect.map((instance) => budgetFromSeconds(instance?.turnInactivityTimeoutSeconds)),
          ),
    } satisfies TurnInactivityPolicyShape;
  }),
);

/**
 * The budget to arm after `event`: an announced provider retry (a running `error` turn item with
 * a retry delay) extends it so a legitimate backoff sleep is not killed; any other activity
 * re-arms the plain budget.
 */
export function budgetAfterEvent(baseMs: number, event: ProviderAdapterV2Event): number {
  if (
    event.type !== "turn_item.updated" ||
    event.turnItem.type !== "error" ||
    event.turnItem.status !== "running"
  ) {
    return baseMs;
  }
  const delayMs = event.turnItem.retry?.retryDelayMs;
  if (delayMs == null || !Number.isFinite(delayMs) || delayMs <= 0) return baseMs;
  return Math.min(
    Math.max(baseMs, delayMs + RETRY_ANNOUNCE_SLACK_MS),
    MAX_RETRY_ANNOUNCE_BUDGET_MS,
  );
}
