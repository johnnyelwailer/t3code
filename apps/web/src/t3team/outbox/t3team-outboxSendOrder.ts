import type { T3TeamOutboxEntry, T3TeamOutboxSendIdentity } from "./t3team-outboxModel";

/**
 * An unconfirmed composer send keeps its place in the queue: it was sent before anything queued
 * while it waited, and the queue drains in `createdAt` order.
 */
export function atSendTime(
  entry: T3TeamOutboxEntry,
  sendIdentity: T3TeamOutboxSendIdentity | undefined,
  sentAt: string,
): T3TeamOutboxEntry {
  return sendIdentity?.unconfirmed ? { ...entry, createdAt: sentAt } : entry;
}
