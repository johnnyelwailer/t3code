/**
 * Lets a structural change to the digest (a section or row added, removed or moved) land inside a
 * view transition. The caller renders what this returns: until the transition's commit, that is the
 * previous value, so the browser snapshots the old layout before the new one is applied. A change
 * with the same structure key (words, counts, timestamps) is shown at once and animates nothing.
 */
import { useEffect, useRef, useState } from "react";

import { runDigestViewTransition } from "~/t3team/t3team-digestViewTransition";

type Held<T> = { readonly value: T; readonly key: string };

export function useDigestViewTransition<T>(next: T, structureKey: string): T {
  const [held, setHeld] = useState<Held<T>>({ value: next, key: structureKey });
  const latest = useRef<Held<T>>({ value: next, key: structureKey });
  const pendingKey = useRef<string | null>(null);
  const settled = held.key === structureKey;

  useEffect(() => {
    latest.current = { value: next, key: structureKey };
    if (held.value === next && held.key === structureKey) return;
    if (settled) {
      setHeld(latest.current);
      return;
    }
    if (pendingKey.current === structureKey) return;
    pendingKey.current = structureKey;
    runDigestViewTransition(() => {
      pendingKey.current = null;
      setHeld(latest.current);
    });
  }, [held, next, structureKey, settled]);

  return settled ? next : held.value;
}
