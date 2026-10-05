/**
 * Ports through which the layers that own inter-agent mailbox delivery and
 * silence watches serve the `t3team.thread.children` `drain` / `watch` /
 * `unwatch` ops. Each is a `Context.Reference` whose default is "not available
 * in this runtime"; the owning layer provides an override once (server.ts),
 * so the children tool never reaches into another feature's internals.
 *
 * @module t3team-toolBrokerChildrenPorts
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  ChildrenDrainOutcome,
  ChildrenSilenceWatchPort,
} from "./t3team-toolBrokerChildrenTypes.ts";

export interface T3TeamMailboxDrainPortShape {
  /** Claims `threadId`'s own pending inter-agent mailbox now. */
  readonly drainOwn: ((threadId: ThreadId) => Effect.Effect<ChildrenDrainOutcome, string>) | null;
}

export class T3TeamMailboxDrainPort extends Context.Reference<T3TeamMailboxDrainPortShape>(
  "t3team/T3TeamMailboxDrainPort",
  { defaultValue: () => ({ drainOwn: null }) },
) {}

export interface T3TeamSilenceWatchPortShape {
  readonly watch: ChildrenSilenceWatchPort | null;
}

export class T3TeamSilenceWatchPort extends Context.Reference<T3TeamSilenceWatchPortShape>(
  "t3team/T3TeamSilenceWatchPort",
  { defaultValue: () => ({ watch: null }) },
) {}
