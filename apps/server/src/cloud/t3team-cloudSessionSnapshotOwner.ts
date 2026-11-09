/**
 * session.yml "Resolve the snapshot owner": `g<actor id>` without the broker, `o<32 hex>` (only
 * the broker can name it) with it. The run's own snapshot keys carry what the workflow used and
 * must agree with that rule. `null` means "cannot tell": the delete refuses what it can't attribute.
 */
const ENTRA_OWNER = /^o[0-9a-f]{32}$/;

export interface SnapshotOwnerEvidence {
  /** The run came through the broker (` · broker` marker, or a claimed standby). */
  readonly brokerRun: boolean;
  /** The run's `actor.id`, session.yml's `github.actor_id`. */
  readonly actorId: number | null;
  /** The owners in this run's own snapshot cache keys. */
  readonly runCacheOwners: ReadonlyArray<string>;
}

export function snapshotOwnerOf(evidence: SnapshotOwnerEvidence): string | null {
  const { actorId } = evidence;
  const fromActor =
    !evidence.brokerRun && actorId !== null && Number.isSafeInteger(actorId) && actorId >= 0
      ? `g${actorId}`
      : null;
  const written = [...new Set(evidence.runCacheOwners)];
  if (written.length > 1) return null;
  const [fromCache] = written;
  if (fromCache === undefined) return fromActor;
  const consistent = evidence.brokerRun ? ENTRA_OWNER.test(fromCache) : fromCache === fromActor;
  return consistent ? fromCache : null;
}
