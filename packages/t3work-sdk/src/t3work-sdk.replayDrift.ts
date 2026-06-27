/**
 * Replay-drift checks shared by the durable runtime's two dispatch seats: the async
 * `callPrimitive` path (tools/scripts) and the synchronous deterministic path
 * (now/random/uuid). Both compare a replayed call against its recorded journal entry the
 * same way, so the comparison lives here.
 */

import { ReplayDriftError } from "./t3work-sdk.errors.ts";
import { hashPrefix } from "./t3work-sdk.canonicalJson.ts";
import type { JournalEntry } from "./t3work-sdk.journalReader.ts";

/** Throw if a recorded entry's call identity (kind/refId) or args hash diverges from the
 * call replaying at this `seq`. */
export function assertJournalMatch(
  seq: number,
  recorded: JournalEntry,
  kind: string,
  refId: string,
  argsHash: string,
  filePath: string | undefined,
): void {
  if (recorded.kind !== kind || recorded.refId !== refId) {
    throw new ReplayDriftError({
      seq,
      reason: "call",
      expected: { kind: recorded.kind, refId: recorded.refId },
      observed: { kind, refId },
      ...(filePath === undefined ? {} : { filePath }),
    });
  }
  if (recorded.argsHash !== argsHash) {
    throw new ReplayDriftError({
      seq,
      reason: "args",
      expected: { argsHash: hashPrefix(recorded.argsHash) },
      observed: { argsHash: hashPrefix(argsHash) },
      ...(filePath === undefined ? {} : { filePath }),
    });
  }
}

/** Throw the "gap" drift: a `seq` at or below the recorded frontier with no journal entry
 * means the body skipped a call the original run made. */
export function gapDrift(
  seq: number,
  kind: string,
  refId: string,
  filePath: string | undefined,
): never {
  throw new ReplayDriftError({
    seq,
    reason: "call",
    expected: { presence: "gap" },
    observed: { kind, refId },
    ...(filePath === undefined ? {} : { filePath }),
  });
}
