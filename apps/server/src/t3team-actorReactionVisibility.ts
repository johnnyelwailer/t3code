/**
 * Digest run input assembly: the digest base plus the STANDING inter-agent
 * protocol on the thread's first digest since process start, plus the
 * human-steering suffix (t3team-actorSteeringContext.ts) when the thread has a
 * parent.
 *
 * @module t3team-actorReactionVisibility
 */
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailboxEntry.ts";
import {
  ACTOR_STANDING_INSTRUCTION,
  buildActorReactionDigestInput,
} from "./t3team-actorReactionInput.ts";

export const buildActorReactionTurnInput = (
  entries: ReadonlyArray<T3TeamActorMailboxEntry>,
  includeStandingInstruction: boolean,
  steeringInstruction = "",
): string =>
  [
    buildActorReactionDigestInput(entries),
    ...(includeStandingInstruction ? [ACTOR_STANDING_INSTRUCTION] : []),
    ...(steeringInstruction === "" ? [] : [steeringInstruction]),
  ].join("\n\n");
