/**
 * Stamp a failed cloud-session create on the Run-on target and, when a first message is waiting
 * on it, fail that send too so the setup card leaves "Queued" and offers Retry.
 */
import type * as Cause from "effect/Cause";

import { failDraftCloudQueuedSend, getDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import {
  cloudSessionCreateFailureFacts,
  cloudSessionCreateFailureInline,
} from "./t3team-cloudSessionFailure";
import { failCloudSessionCreate } from "./t3team-cloudSessionTargetStore";

/** Returns true when a queued send was failed (the caller should skip the toast). */
export function applyCloudSessionCreateFailure(
  scopeKey: string,
  result: { readonly cause: Cause.Cause<unknown> },
  draftId: string | null = scopeKey,
): boolean {
  const message = cloudSessionCreateFailureInline(result);
  const facts = cloudSessionCreateFailureFacts(result);
  failCloudSessionCreate(scopeKey, { message, ...facts });
  if (draftId === null) return false;
  const queued = getDraftCloudQueuedSend(draftId);
  if (queued === null) return false;
  failDraftCloudQueuedSend(draftId, queued.messageId, message, true, {
    kind: "create_failed",
    reason: facts.reason ?? null,
  });
  return true;
}
