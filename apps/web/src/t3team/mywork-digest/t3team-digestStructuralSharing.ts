/**
 * Keeps what did not change. A digest round maps a whole payload into fresh objects, so without
 * this every poll hands the views a graph in which nothing is `===` to the one on screen, even when
 * the server only moved a timestamp.
 *
 * `next` is a value the caller just built and owns: its unchanged subtrees are swapped for the
 * matching subtree of `previous` in place, and `previous` itself comes back when nothing differs.
 * Only plain objects and arrays are walked; anything else is compared by identity.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function shareStructure<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (Array.isArray(previous) && Array.isArray(next)) {
    let unchanged = previous.length === next.length;
    next.forEach((item, index) => {
      const kept = index < previous.length ? shareStructure(previous[index], item) : item;
      if (kept !== previous[index]) unchanged = false;
      next[index] = kept;
    });
    return unchanged ? previous : next;
  }
  if (isPlainRecord(previous) && isPlainRecord(next)) {
    const target: Record<string, unknown> = next;
    const keys = Object.keys(target);
    let unchanged = Object.keys(previous).length === keys.length;
    for (const key of keys) {
      const present = Object.hasOwn(previous, key);
      const kept = present ? shareStructure(previous[key], target[key]) : target[key];
      if (!present || kept !== previous[key]) unchanged = false;
      target[key] = kept;
    }
    return unchanged ? previous : next;
  }
  return next;
}
