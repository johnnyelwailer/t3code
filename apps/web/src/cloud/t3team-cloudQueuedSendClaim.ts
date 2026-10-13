/**
 * The cross-window claim on one queued cloud send, taken by its dispatch and by its Cancel so the
 * two never overlap. It is the outbox's dispatch claim (`acquireOutboxDispatch`, 45 s TTL); a
 * held claim is renewed (re-acquiring one's own claim refreshes it) for as long as the holder
 * works, so a long send keeps it, and a crashed window's claim simply expires.
 */
import { acquireOutboxDispatch, releaseOutboxDispatch } from "~/t3team/outbox/t3team-outboxStorage";

/** Well inside the claim's 45 s TTL. */
const CLOUD_QUEUED_SEND_CLAIM_RENEW_MS = 15_000;

function claimKey(messageId: string): string {
  return `cloud-queued-send:${messageId}`;
}

/** Takes the claim, or returns null when another window holds a fresh one. */
export function holdCloudQueuedSendClaim(
  messageId: string,
): { readonly release: () => void } | null {
  const key = claimKey(messageId);
  if (!acquireOutboxDispatch(key)) return null;
  const renew = setInterval(() => acquireOutboxDispatch(key), CLOUD_QUEUED_SEND_CLAIM_RENEW_MS);
  return {
    release: () => {
      clearInterval(renew);
      releaseOutboxDispatch(key);
    },
  };
}
