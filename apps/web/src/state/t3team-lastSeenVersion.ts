import { useState } from "react";

const LAST_SEEN_KEY = "nexi.lastSeenVersion";

type VersionStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Whether the running version differs from the one the user last saw acknowledged. The update
 * notice only exposes this; a welcome or what's-new surface (#788) decides what to do with it. A
 * first run (nothing stored) is reported as a change with no previous version.
 */
export function readVersionChange(
  storage: VersionStorage,
  currentVersion: string,
): { readonly changed: boolean; readonly previous: string | null } {
  let previous: string | null = null;
  try {
    previous = storage.getItem(LAST_SEEN_KEY);
  } catch {
    // storage unavailable: treat as nothing seen
  }
  return { changed: previous !== currentVersion, previous };
}

export function markVersionSeen(storage: VersionStorage, version: string): void {
  try {
    storage.setItem(LAST_SEEN_KEY, version);
  } catch {
    // best effort
  }
}

export function useVersionChangedSinceLastSeen(currentVersion: string) {
  const [change, setChange] = useState(() =>
    readVersionChange(window.localStorage, currentVersion),
  );
  const markSeen = () => {
    markVersionSeen(window.localStorage, currentVersion);
    setChange({ changed: false, previous: currentVersion });
  };
  return { ...change, markSeen };
}
