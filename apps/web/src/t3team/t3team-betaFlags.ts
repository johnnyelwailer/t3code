/**
 * Beta feature flags for the My Work Digest variants. Persisted in
 * localStorage next to the other `t3team:` keys (same pattern as
 * `t3team-projectSetupProfile.ts`): a single JSON record, a change event for
 * in-page updates, and `storage` events for cross-tab sync.
 */
import { useSyncExternalStore } from "react";

export type T3TeamDigestBurndownVariant = "off" | "chart" | "sparkline";
export type T3TeamDigestDefaultLens = "digest" | "hierarchy" | "board";
export type T3TeamDigestRowNavigation = "in-app" | "ticket-url";
export type T3TeamDigestAgentDots = "stacked" | "badges";

export interface T3TeamBetaFlags {
  digestBurndownVariant: T3TeamDigestBurndownVariant;
  digestDefaultLens: T3TeamDigestDefaultLens;
  digestRowNavigation: T3TeamDigestRowNavigation;
  digestAgentDots: T3TeamDigestAgentDots;
}

export const T3TEAM_BETA_FLAGS_STORAGE_KEY = "t3team:beta-flags";
const T3TEAM_BETA_FLAGS_CHANGED_EVENT = "t3team:beta-flags-changed";

export const DEFAULT_T3TEAM_BETA_FLAGS: T3TeamBetaFlags = {
  digestBurndownVariant: "off",
  digestDefaultLens: "digest",
  digestRowNavigation: "in-app",
  digestAgentDots: "stacked",
};

const FLAG_VALUE_SETS: { [K in keyof T3TeamBetaFlags]: ReadonlySet<T3TeamBetaFlags[K]> } = {
  digestBurndownVariant: new Set(["off", "chart", "sparkline"]),
  digestDefaultLens: new Set(["digest", "hierarchy", "board"]),
  digestRowNavigation: new Set(["in-app", "ticket-url"]),
  digestAgentDots: new Set(["stacked", "badges"]),
};

function parseStoredFlags(raw: string | null): T3TeamBetaFlags {
  const flags: T3TeamBetaFlags = { ...DEFAULT_T3TEAM_BETA_FLAGS };
  if (!raw) {
    return flags;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const writable = flags as Record<keyof T3TeamBetaFlags, string>;
      for (const key of Object.keys(FLAG_VALUE_SETS) as Array<keyof T3TeamBetaFlags>) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === "string" && (FLAG_VALUE_SETS[key] as ReadonlySet<string>).has(value)) {
          writable[key] = value;
        }
      }
    }
  } catch {
    // Corrupt stored flags fall back to defaults instead of breaking the app.
  }
  return flags;
}

// Snapshot cache: useSyncExternalStore requires a stable reference per stored
// value, and pure (non-React) callers share the same read path.
let cachedRaw: string | null = null;
let cachedFlags: T3TeamBetaFlags = { ...DEFAULT_T3TEAM_BETA_FLAGS };

/**
 * Read the current flags, merged over the defaults. Read-only: treat the
 * returned object as immutable.
 */
export function readT3TeamBetaFlags(): T3TeamBetaFlags {
  if (typeof window === "undefined") {
    return cachedFlags;
  }
  const raw = window.localStorage.getItem(T3TEAM_BETA_FLAGS_STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedFlags = parseStoredFlags(raw);
  }
  return cachedFlags;
}

function persistT3TeamBetaFlags(flags: T3TeamBetaFlags): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(T3TEAM_BETA_FLAGS_STORAGE_KEY, JSON.stringify(flags));
  window.dispatchEvent(new CustomEvent(T3TEAM_BETA_FLAGS_CHANGED_EVENT));
}

export function writeT3TeamBetaFlag<K extends keyof T3TeamBetaFlags>(
  key: K,
  value: T3TeamBetaFlags[K],
): void {
  if (!FLAG_VALUE_SETS[key].has(value)) {
    return;
  }
  persistT3TeamBetaFlags({ ...readT3TeamBetaFlags(), [key]: value });
}

export function resetT3TeamBetaFlags(): void {
  persistT3TeamBetaFlags({ ...DEFAULT_T3TEAM_BETA_FLAGS });
}

function subscribeT3TeamBetaFlags(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {
      // No-op outside the browser runtime.
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === T3TEAM_BETA_FLAGS_STORAGE_KEY) {
      onStoreChange();
    }
  };
  const onChanged = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(T3TEAM_BETA_FLAGS_CHANGED_EVENT, onChanged);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(T3TEAM_BETA_FLAGS_CHANGED_EVENT, onChanged);
  };
}

export function useT3TeamBetaFlags(): {
  flags: T3TeamBetaFlags;
  setFlag: <K extends keyof T3TeamBetaFlags>(key: K, value: T3TeamBetaFlags[K]) => void;
} {
  const flags = useSyncExternalStore(
    subscribeT3TeamBetaFlags,
    readT3TeamBetaFlags,
    readT3TeamBetaFlags,
  );
  // Module-level function: already referentially stable, no memo needed.
  return { flags, setFlag: writeT3TeamBetaFlag };
}
