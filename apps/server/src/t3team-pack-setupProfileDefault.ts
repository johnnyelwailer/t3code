/**
 * Which pack-contributed setup profile carries the `default: true` marker that preselects a
 * profile when nothing is stored.
 *
 * With the work profile chooser disabled nobody gets to pick, so the preselected profile has to
 * be the one profile that is actually tailored: the developer profile, i.e. the first overlay
 * profile in the `engineering` category. See `t3team-workProfileChooserFlag.ts`.
 */

export type SetupProfileDefaultCandidate = {
  readonly id: string;
  readonly category: string;
  readonly default?: boolean | undefined;
};

/**
 * Id that must carry `default: true` instead of the pack-declared default, or `undefined` when
 * the pack's own `default` markers should be passed through untouched.
 *
 * Untouched means exactly that: with the chooser enabled, or with no engineering profile to fall
 * back to, the overlay output is byte-identical to the pack's declaration — including the (odd
 * but legal) case of several profiles claiming `default`.
 */
export function resolveSetupProfileDefaultOverrideId(
  profiles: readonly SetupProfileDefaultCandidate[] | undefined,
  workProfileChooserEnabled: boolean,
): string | undefined {
  if (workProfileChooserEnabled || !profiles) return undefined;
  return profiles.find((profile) => profile.category === "engineering")?.id;
}

/** Whether `profile` is the default under `overrideId` (undefined ⇒ the pack's own marker wins). */
export function isSetupProfileDefault(
  profile: SetupProfileDefaultCandidate,
  overrideId: string | undefined,
): boolean {
  return overrideId === undefined ? profile.default === true : profile.id === overrideId;
}
