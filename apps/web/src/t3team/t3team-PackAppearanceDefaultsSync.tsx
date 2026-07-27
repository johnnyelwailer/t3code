/**
 * Applies a pack theme's `appearanceDefaults` to the user's client settings exactly once.
 *
 * Mounted beside {@link ./t3team-PackAppearanceSync.tsx}: that component applies the theme (colors,
 * brand, density — host-owned presentation), this one seeds the two settings the USER owns, so the
 * distribution decides where they start without ever overriding a later choice. The decision itself
 * is pure ({@link ./t3team-packAppearanceDefaults.ts}); this file only supplies storage and the
 * settings writer.
 */

import { useEffect, useRef } from "react";

import { useUpdateClientSettings } from "../hooks/useSettings";
import { useT3TeamPackAppearance } from "./t3team-packAppearance";
import {
  resolveT3TeamAppearanceDefaults,
  T3TEAM_APPEARANCE_DEFAULTS_STORAGE_KEY,
  t3teamAppearanceDefaultsMarker,
} from "./t3team-packAppearanceDefaults";

function readAppliedMarker(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(T3TEAM_APPEARANCE_DEFAULTS_STORAGE_KEY);
  } catch {
    // A blocked/full localStorage must not break the shell; without a marker the worst case is
    // re-applying the starting values on a later load, never a crash.
    return null;
  }
}

export function T3TeamPackAppearanceDefaultsSync() {
  const appearance = useT3TeamPackAppearance();
  const updateClientSettings = useUpdateClientSettings();
  const defaults = appearance?.appearanceDefaults;
  const themeId = appearance?.themeId;
  // The appearance arrives asynchronously and this effect writes settings, which re-renders the
  // tree; without a guard that is a write loop.
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!defaults || !themeId) return;
    const marker = t3teamAppearanceDefaultsMarker({ themeId, defaults });
    if (handledRef.current === marker) return;
    const decision = resolveT3TeamAppearanceDefaults({
      defaults,
      marker,
      appliedMarker: readAppliedMarker(),
    });
    if (!decision.appliedMarker) return;
    handledRef.current = marker;
    if (decision.patch) updateClientSettings(decision.patch);
    try {
      window.localStorage.setItem(T3TEAM_APPEARANCE_DEFAULTS_STORAGE_KEY, decision.appliedMarker);
    } catch {
      // See readAppliedMarker: storage failures degrade to "may re-apply later", not a crash.
    }
  }, [defaults, themeId, updateClientSettings]);

  return null;
}
