/**
 * Inter-agent reaction-turn input assembly (post-overhaul): the digest base
 * plus the STANDING inter-agent protocol, delivered ONCE per session instead
 * of on every message.
 *
 * History: GHE #156 appended a situational user-return instruction to EVERY
 * reaction turn (strong "answer the user first" rule vs a quiet "don't
 * re-state" rule) because every delivery drove its own turn and could bury the
 * user's message. Under the overhaul, digests only reach a thread at a
 * boundary (idle, and not while the user is actively engaged — see
 * t3team-actorMessageReactor.ts), so the per-turn situational suffix is gone.
 * The user-priority guarantee now lives in {@link ACTOR_STANDING_INSTRUCTION}
 * (the once-per-session block), and this module only assembles base + suffix.
 *
 * The standing instruction is a well-known SUFFIX after the digest base so
 * the restart-rehydrate prefix-matching (collectPendingActorDeliveries in
 * t3team-actorReactionInput.ts) keeps matching the base alone.
 *
 * @module t3team-actorReactionVisibility
 */
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

import {
  ACTOR_STANDING_INSTRUCTION,
  buildActorReactionDigestInput,
} from "./t3team-actorReactionInput.ts";

export { ACTOR_STANDING_INSTRUCTION } from "./t3team-actorReactionInput.ts";

/**
 * The reaction turn's full input: the stable digest base, plus the standing
 * instruction ONLY when this is the thread's first digest since process start
 * (`includeStandingInstruction`). The base is kept EXACTLY as produced by
 * {@link buildActorReactionDigestInput} so rehydrate prefix-matching works.
 */
export const buildActorReactionTurnInput = (
  entries: ReadonlyArray<T3TeamActorMailboxEntry>,
  includeStandingInstruction: boolean,
): string =>
  includeStandingInstruction
    ? `${buildActorReactionDigestInput(entries)}\n\n${ACTOR_STANDING_INSTRUCTION}`
    : buildActorReactionDigestInput(entries);
