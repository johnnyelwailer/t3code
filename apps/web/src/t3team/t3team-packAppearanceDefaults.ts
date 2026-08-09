/**
 * First-run application of a pack theme's `appearanceDefaults` onto the client appearance settings
 * a USER owns (`legacySidebarEnabled`, `glassOpacity`).
 *
 * These are preferences, not theme tokens, so the rule is NOT the one the setup profile uses
 * ("pack default outranks nothing-stored"). Applied that way, every page load would re-assert the
 * pack value and silently undo a user who turned glass down or switched the lens back. This is
 * apply-once-then-never-again.
 *
 * The marker embeds the VALUES rather than a theme version, because a theme has no version field: a
 * distribution that ships a deliberately different look therefore gets exactly one fresh chance to
 * move the starting point, and a redeploy of the same values changes nothing.
 *
 * Pure, so the decision is testable without a browser or a settings store.
 */

export type T3TeamPackAppearanceDefaults = {
  readonly sidebarLens?: "code" | "work";
  readonly glassOpacity?: number;
  /**
   * The theme's `density` multiplier (0.875–1.125), carried here rather than applied as CSS.
   * Upstream owns interface font size and writes it inline on <html> unconditionally, so a
   * stylesheet `font-size:%` from the pack never took effect; seeding the user's preference once
   * is the only way a distribution can move it without fighting the control that owns it.
   */
  readonly density?: number;
};

/** The client-settings patch to write. */
export type T3TeamAppearanceDefaultsPatch = {
  readonly legacySidebarEnabled?: boolean;
  readonly glassOpacity?: number;
  readonly fontSizeInterface?: number;
};

/** Upstream's default interface font size, and the bounds it clamps to. */
const DEFAULT_INTERFACE_FONT_SIZE = 16;
const MIN_INTERFACE_FONT_SIZE = 12;
const MAX_INTERFACE_FONT_SIZE = 20;

/** A density multiplier expressed as the interface font size upstream actually applies. */
export function t3teamInterfaceFontSizeForDensity(density: number): number {
  const scaled = Math.round(DEFAULT_INTERFACE_FONT_SIZE * density);
  return Math.min(MAX_INTERFACE_FONT_SIZE, Math.max(MIN_INTERFACE_FONT_SIZE, scaled));
}

/** The density seeding decision, markered independently of lens/glass. */
export function resolveT3TeamDensityDefault(input: {
  readonly density: number | undefined;
  readonly marker: string;
  readonly appliedMarker: string | null;
}): { readonly patch?: { readonly fontSizeInterface: number }; readonly appliedMarker?: string } {
  if (input.density === undefined || input.appliedMarker === input.marker) {
    return {};
  }
  return {
    patch: { fontSizeInterface: t3teamInterfaceFontSizeForDensity(input.density) },
    appliedMarker: input.marker,
  };
}

export type T3TeamAppearanceDefaultsDecision = {
  /** Absent when nothing should be written. */
  readonly patch?: T3TeamAppearanceDefaultsPatch;
  /** Store this once the decision is honoured. Absent when there was nothing to decide. */
  readonly appliedMarker?: string;
};

export const T3TEAM_APPEARANCE_DEFAULTS_STORAGE_KEY = "t3team:pack-appearance-defaults-applied";

/** Identity of one set of declared defaults: theme id plus the values themselves. */
export function t3teamAppearanceDefaultsMarker(input: {
  readonly themeId: string;
  readonly defaults: T3TeamPackAppearanceDefaults;
}): string {
  const lens = input.defaults.sidebarLens ?? "-";
  const glass = input.defaults.glassOpacity ?? "-";
  // Density is deliberately NOT part of this string. The marker is compared for equality, so
  // adding a segment invalidates every marker already in the wild — which would re-assert lens and
  // glass over the choices of every existing user exactly once, the failure this file exists to
  // prevent. Density seeding carries its own marker instead (`t3teamDensityDefaultMarker`).
  return `${input.themeId}|lens=${lens}|glass=${glass}`;
}

/** Separate identity for the density seeding, so it can be added without invalidating the above. */
export function t3teamDensityDefaultMarker(input: {
  readonly themeId: string;
  readonly density: number | undefined;
}): string {
  return `${input.themeId}|density=${input.density ?? "-"}`;
}

export const T3TEAM_DENSITY_DEFAULT_STORAGE_KEY = "t3team:pack-density-applied";

export function resolveT3TeamAppearanceDefaults(input: {
  readonly defaults: T3TeamPackAppearanceDefaults | undefined;
  readonly marker: string;
  /** Marker persisted by a previous application, if any. */
  readonly appliedMarker: string | null;
}): T3TeamAppearanceDefaultsDecision {
  if (!input.defaults || input.appliedMarker === input.marker) {
    return {};
  }
  const defaults = input.defaults;
  const patch: T3TeamAppearanceDefaultsPatch = {
    // The lens is stored as upstream's sidebar switch, which is now the INVERTED
    // `legacySidebarEnabled`. This is the single mapping on the WRITE side, mirroring
    // `useT3TeamSidebarLens` on the read side.
    ...(defaults.sidebarLens === undefined
      ? {}
      : { legacySidebarEnabled: defaults.sidebarLens !== "work" }),
    ...(defaults.glassOpacity === undefined ? {} : { glassOpacity: defaults.glassOpacity }),
  };
  // A defaults block that declares nothing is still "handled": recording the marker stops this
  // from re-deciding on every mount.
  return Object.keys(patch).length === 0
    ? { appliedMarker: input.marker }
    : { patch, appliedMarker: input.marker };
}
