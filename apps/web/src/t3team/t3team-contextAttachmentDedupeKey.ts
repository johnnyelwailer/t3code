/**
 * The identity of an attached resource, so the same thing attached twice collides once.
 *
 * `dedupeKey` is the ONLY thing the add-to-chat store dedupes on — both `hasThreadAttachmentDuplicate`
 * and `hasQueuedAttachmentDuplicate` return `false` immediately when it is missing. So a request that
 * forgets the key is not "less deduped", it is not deduped at all, and every path that attaches the
 * same resource lands another copy.
 *
 * That is why the key is built here from RESOURCE IDENTITY (provider, kind, id) rather than composed at
 * each call site: a call site that spells the key differently, or omits it, silently disables dedupe for
 * everything it enqueues. The project is part of the key because the same Jira key can exist in two
 * connected projects and those are different resources.
 *
 * Never derive the key from a title or label — a renamed work item would stop colliding with itself.
 */

export function buildT3TeamResourceDedupeKey(input: {
  /** What kind of thing it is ("work-item", "project-context", …). */
  readonly kind: string;
  /** Stable id within the source — a Jira issue KEY, never a title. */
  readonly id: string;
  readonly projectId: string;
}): string {
  return `${input.kind}:${input.projectId}:${input.id}`;
}

/**
 * The key for one work item.
 *
 * Deliberately does NOT include the provider. A project has exactly one source, so `projectId` already
 * scopes it — and every producer of this key must be able to spell it identically from whatever data it
 * happens to hold. The context-bundle payload builder only has `projectId` and `ticketKey`; requiring a
 * provider there is what let two producers emit different keys for the same Epic, which disabled dedupe
 * and put two identical chips on one composer.
 */
export function buildT3TeamWorkItemDedupeKey(input: {
  readonly projectId: string;
  /** The work item's display key (e.g. `NXAI-8`). */
  readonly workItemKey: string;
}): string {
  return buildT3TeamResourceDedupeKey({
    kind: "work-item",
    id: input.workItemKey,
    projectId: input.projectId,
  });
}
