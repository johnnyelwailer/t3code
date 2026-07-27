/**
 * First-run application of a pack theme's `appearanceDefaults` onto the client appearance settings
 * a USER owns (`sidebarV2Enabled`, `glassOpacity`).
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
};

/** The client-settings patch to write. */
export type T3TeamAppearanceDefaultsPatch = {
  readonly sidebarV2Enabled?: boolean;
  readonly glassOpacity?: number;
};

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
  return `${input.themeId}|lens=${lens}|glass=${glass}`;
}

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
    // The lens is stored as upstream's beta flag. This is the single mapping on the WRITE side,
    // mirroring `useT3TeamSidebarLens` on the read side.
    ...(defaults.sidebarLens === undefined
      ? {}
      : { sidebarV2Enabled: defaults.sidebarLens === "work" }),
    ...(defaults.glassOpacity === undefined ? {} : { glassOpacity: defaults.glassOpacity }),
  };
  // A defaults block that declares nothing is still "handled": recording the marker stops this
  // from re-deciding on every mount.
  return Object.keys(patch).length === 0
    ? { appliedMarker: input.marker }
    : { patch, appliedMarker: input.marker };
}
