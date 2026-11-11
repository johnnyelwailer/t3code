export const DISTRIBUTION_THEME_ENV = "T3CODE_DESKTOP_THEME";

export type DistributionThemeManifest = {
  readonly theme?: string | undefined;
  readonly themes?: readonly string[] | undefined;
};

/**
 * Every theme file of a distribution, the default first. `preferred` (a release flavor's choice)
 * must be one of the distribution's own themes, so a typo fails the build instead of shipping the
 * wrong accent.
 */
export function orderedDistributionThemePaths(
  manifest: DistributionThemeManifest,
  preferred?: string,
): ReadonlyArray<string> {
  const declared = [manifest.theme, ...(manifest.themes ?? [])].filter(
    (path): path is string => path !== undefined && path.trim() !== "",
  );
  const all = [...new Set(declared)];
  const wanted = preferred?.trim();
  if (!wanted) return all;
  if (!all.includes(wanted)) {
    throw new Error(
      `${DISTRIBUTION_THEME_ENV} names "${wanted}", which is not a theme of the distribution (${all.join(", ")}).`,
    );
  }
  return [wanted, ...all.filter((path) => path !== wanted)];
}
