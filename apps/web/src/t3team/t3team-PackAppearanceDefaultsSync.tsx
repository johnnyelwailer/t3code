/**
 * Applies a pack theme's `appearanceDefaults` to the user's client settings exactly once.
 *
 * Mounted beside {@link ./t3team-PackAppearanceSync.tsx}: that component applies what the host owns
 * (brand, typography, radius), this one seeds the settings the USER owns, so the distribution
 * decides where they start without ever overriding a later choice. The decision itself is pure
 * ({@link ./t3team-packAppearanceDefaults.ts}); this file only supplies storage and the settings
 * writer.
 *
 * `density` is folded in here from the theme's top level rather than from `appearanceDefaults`,
 * because upstream took ownership of interface font size and applies it inline on <html>: a
 * stylesheet percentage from the pack could never win, so the multiplier has to become a seeded
 * user preference to have any effect at all.
 */

import { useEffect, useRef } from "react";

import { useUpdateClientSettings } from "../hooks/useSettings";
import { useT3TeamPackAppearance } from "./t3team-packAppearance";
import {
  resolveT3TeamAppearanceDefaults,
  resolveT3TeamDensityDefault,
  T3TEAM_APPEARANCE_DEFAULTS_STORAGE_KEY,
  T3TEAM_DENSITY_DEFAULT_STORAGE_KEY,
  t3teamAppearanceDefaultsMarker,
  t3teamDensityDefaultMarker,
} from "./t3team-packAppearanceDefaults";

function readMarker(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // A blocked/full localStorage must not break the shell; without a marker the worst case is
    // re-applying the starting values on a later load, never a crash.
    return null;
  }
}

function writeMarker(key: string, marker: string): void {
  try {
    window.localStorage.setItem(key, marker);
  } catch {
    // See readMarker: storage failures degrade to "may re-apply later", not a crash.
  }
}

export function T3TeamPackAppearanceDefaultsSync() {
  const appearance = useT3TeamPackAppearance();
  const updateClientSettings = useUpdateClientSettings();
  const defaults = appearance?.appearanceDefaults;
  const density = appearance?.density;
  const themeId = appearance?.themeId;
  // The appearance arrives asynchronously and this effect writes settings, which re-renders the
  // tree; without a guard that is a write loop.
  const handledRef = useRef<string | null>(null);
  const handledDensityRef = useRef<string | null>(null);

  useEffect(() => {
    if (!defaults || !themeId) return;
    const marker = t3teamAppearanceDefaultsMarker({ themeId, defaults });
    if (handledRef.current === marker) return;
    const decision = resolveT3TeamAppearanceDefaults({
      defaults,
      marker,
      appliedMarker: readMarker(T3TEAM_APPEARANCE_DEFAULTS_STORAGE_KEY),
    });
    if (!decision.appliedMarker) return;
    handledRef.current = marker;
    if (decision.patch) updateClientSettings(decision.patch);
    writeMarker(T3TEAM_APPEARANCE_DEFAULTS_STORAGE_KEY, decision.appliedMarker);
  }, [defaults, themeId, updateClientSettings]);

  // Density is markered separately so that introducing it does not invalidate the lens/glass
  // marker every existing user already has stored.
  useEffect(() => {
    if (!themeId || density === undefined) return;
    const marker = t3teamDensityDefaultMarker({ themeId, density });
    if (handledDensityRef.current === marker) return;
    const decision = resolveT3TeamDensityDefault({
      density,
      marker,
      appliedMarker: readMarker(T3TEAM_DENSITY_DEFAULT_STORAGE_KEY),
    });
    if (!decision.appliedMarker) return;
    handledDensityRef.current = marker;
    if (decision.patch) updateClientSettings(decision.patch);
    writeMarker(T3TEAM_DENSITY_DEFAULT_STORAGE_KEY, decision.appliedMarker);
  }, [density, themeId, updateClientSettings]);

  return null;
}
