import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";

export function buildKickoffQueueKey(projectId: string, ticketId: string): string {
  return `${projectId}:${ticketId}`;
}

export function hasQueuedAttachmentDuplicate<T extends { attachment: T3TeamContextAttachment }>(
  list: ReadonlyArray<T>,
  attachment: T3TeamContextAttachment,
): boolean {
  if (!attachment.dedupeKey) {
    return false;
  }
  return list.some((item) => item.attachment.dedupeKey === attachment.dedupeKey);
}

export function hasThreadAttachmentDuplicate(
  list: ReadonlyArray<T3TeamContextAttachment>,
  attachment: T3TeamContextAttachment,
): boolean {
  if (!attachment.dedupeKey) {
    return false;
  }
  return list.some((item) => item.dedupeKey === attachment.dedupeKey);
}

export function replaceQueuedAttachment<T extends { attachment: T3TeamContextAttachment }>(input: {
  list: ReadonlyArray<T>;
  attachmentId: string;
  buildReplacement: (item: T) => T;
}): { changed: boolean; items: T[] } {
  let changed = false;
  const items = input.list.map((item) => {
    if (item.attachment.id !== input.attachmentId) {
      return item;
    }
    changed = true;
    return input.buildReplacement(item);
  });
  return {
    changed,
    items,
  };
}

export function replaceThreadAttachmentList(input: {
  list: ReadonlyArray<T3TeamContextAttachment>;
  attachmentId: string;
  attachment: T3TeamContextAttachment;
}): { changed: boolean; items: T3TeamContextAttachment[] } {
  let changed = false;
  const items = input.list.map((candidate) => {
    if (candidate.id !== input.attachmentId) {
      return candidate;
    }
    changed = true;
    return input.attachment;
  });
  return {
    changed,
    items,
  };
}

export function removeThreadAttachmentList(
  list: ReadonlyArray<T3TeamContextAttachment>,
  attachmentId: string,
): T3TeamContextAttachment[] {
  return list.filter((attachment) => attachment.id !== attachmentId);
}

export function deleteRecordEntry<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * One entry per `dedupeKey` in a thread's attachment list — the invariant, enforced on every write.
 *
 * The add path checked for duplicates, but that only helps when the two writers agree on the key, and it
 * does nothing for a write that REPLACES an entry (a replacement can carry a key that already exists
 * elsewhere in the list). Two producers spelling the same Epic differently put two identical chips on one
 * composer and, because this list becomes the turn's context, sent the whole bundle to the model twice.
 *
 * First writer wins: an attachment already in the list is the one the user has seen, and a later arrival
 * for the same resource is the redundant one. Keyless entries are always kept — they are not claiming an
 * identity, so collapsing them would silently drop distinct context.
 */
export function dedupeThreadAttachmentsByKey(
  list: ReadonlyArray<T3TeamContextAttachment>,
): T3TeamContextAttachment[] {
  const seenKeys = new Set<string>();
  const next: T3TeamContextAttachment[] = [];
  for (const attachment of list) {
    if (!attachment.dedupeKey) {
      next.push(attachment);
      continue;
    }
    if (seenKeys.has(attachment.dedupeKey)) {
      continue;
    }
    seenKeys.add(attachment.dedupeKey);
    next.push(attachment);
  }
  return next;
}
