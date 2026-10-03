/**
 * How the turn-inactivity watchdog settles a run: it feeds synthetic provider events into the
 * run's own event pipeline (merged after ownership routing), so the stall is ingested, finalized
 * and its failure item written exactly like a provider-reported failure. A root provider turn the
 * provider left `running` is closed as `failed` first.
 *
 * @module t3team-turnInactivitySettlement
 */
import type { OrchestrationV2ProviderTurn, RunAttemptId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import type { ProviderAdapterV2Event } from "./ProviderAdapter.ts";

type TerminalEvent = Extract<ProviderAdapterV2Event, { readonly type: "turn.terminal" }>;

export const makeTurnInactivitySettlement = (attemptId: RunAttemptId) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ProviderAdapterV2Event>();
    const rootTurn = yield* Ref.make<OrchestrationV2ProviderTurn | null>(null);
    return {
      /** Synthetic events; merge into the routed provider stream. */
      events: Stream.fromQueue(queue),
      /** Remembers the run's root provider turn from the routed stream. */
      observe: (event: ProviderAdapterV2Event) =>
        event.type === "provider_turn.updated" && event.providerTurn.runAttemptId === attemptId
          ? Ref.set(rootTurn, event.providerTurn)
          : Effect.void,
      settle: (terminal: TerminalEvent) =>
        Effect.gen(function* () {
          const turn = yield* Ref.get(rootTurn);
          if (turn !== null && turn.completedAt === null) {
            yield* Queue.offer(queue, {
              type: "provider_turn.updated",
              driver: terminal.driver,
              providerTurn: { ...turn, status: "failed", completedAt: yield* DateTime.now },
            });
          }
          yield* Queue.offer(queue, {
            ...terminal,
            providerTurnId: turn?.id ?? terminal.providerTurnId,
          });
        }),
    };
  });
