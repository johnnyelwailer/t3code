/**
 * Hook overrides through which the shared inter-agent mailbox
 * (t3team-actorMailboxService.ts) serves its two entry points:
 *
 * - `ThreadMailboxDelivery` — `t3_thread_send` mode "mailbox" (provided to
 *   `McpHttpServer.layer` in server.ts);
 * - `T3TeamMailboxDrainPort` — `t3team_children op:"drain"`: deliver the
 *   caller's own pending messages now, skipping the coalescing window
 *   (provided to the tool broker layer in server.ts).
 *
 * Both read the ONE `T3TeamActorMailboxLive` instance (same layer reference).
 *
 * @module t3team-actorMailboxPorts
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ThreadMailboxDelivery } from "./mcp/t3team-threadMailboxDelivery.ts";
import { mailboxEntrySubject, type MailboxDrainOutcome } from "./t3team-actorMailboxDelivery.ts";
import { T3TeamActorMailbox, T3TeamActorMailboxLive } from "./t3team-actorMailboxService.ts";
import { T3TeamMailboxDrainPort } from "./t3team-toolBrokerChildrenPorts.ts";
import type { ChildrenDrainOutcome } from "./t3team-toolBrokerChildrenTypes.ts";

/** The children-tool view of a forced drain of the caller's own mailbox. */
export const toChildrenDrainOutcome = (outcome: MailboxDrainOutcome): ChildrenDrainOutcome => {
  if (outcome.state === "dispatched") {
    return {
      state: "dispatched",
      delivered: outcome.entries.length,
      subjects: outcome.entries.map(mailboxEntrySubject),
    };
  }
  const subjects = outcome.pending.map(mailboxEntrySubject);
  if (outcome.state === "held") {
    return {
      state: "held",
      held: outcome.pending.length,
      subjects,
      note:
        "delivery is paused for this thread (its turn was stopped by the user); the messages " +
        "are delivered when the user writes in this thread again",
    };
  }
  return {
    state: "queued",
    queued: outcome.pending.length,
    subjects,
    note: "this thread is mid-turn; the messages arrive as one turn when this turn ends",
  };
};

export const T3TeamThreadMailboxDeliveryLive = Layer.effect(
  ThreadMailboxDelivery,
  Effect.map(T3TeamActorMailbox, (mailbox) => ({ send: mailbox.send })),
).pipe(Layer.provide(T3TeamActorMailboxLive));

export const T3TeamMailboxDrainPortLive = Layer.effect(
  T3TeamMailboxDrainPort,
  Effect.map(T3TeamActorMailbox, (mailbox) => ({
    drainOwn: (threadId: string) =>
      mailbox.drain(threadId, { force: true }).pipe(
        Effect.map(toChildrenDrainOutcome),
        Effect.mapError((error) => `Inter-agent mailbox unavailable: ${error.operation}`),
      ),
  })),
).pipe(Layer.provide(T3TeamActorMailboxLive));
